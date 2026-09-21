const HOUR_MS = 60 * 60 * 1000;

// A working HTTP endpoint is not proof that its prices or scheduler are current.
export function evaluateRefreshHealth(status, meta, {
  now = Date.now(),
  maxAgeMs = 3 * HOUR_MS,
} = {}) {
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    throw new Error("Catalogue maximum age must be a positive number.");
  }
  const generatedAt = meta?.generated_at || "";
  const refreshCheckedAt = status?.refresh_checked_at || "";
  const generatedTime = Date.parse(generatedAt);
  const checkedTime = Date.parse(refreshCheckedAt);
  const validTime = (value) => Number.isFinite(value) && value <= now + 5 * 60 * 1000;
  const reasons = [];
  if (!validTime(generatedTime)) reasons.push("catalog_timestamp_invalid");
  else if (now - generatedTime > maxAgeMs) reasons.push("catalog_stale");
  if (!validTime(checkedTime)) reasons.push("refresh_timestamp_invalid");
  else if (now - checkedTime > maxAgeMs) reasons.push("scheduler_stalled");
  const productCount = Number(meta?.stats?.active_products || meta?.stats?.total_products || 0);
  if (!Number.isFinite(productCount) || productCount <= 0) reasons.push("catalog_empty");
  // A failure receipt older than the published catalogue is historical.
  if (status?.refresh_status === "failed" && !(checkedTime < generatedTime)) {
    reasons.push(status.refresh_error_code || "refresh_failed");
  } else if (!["ok", "failed"].includes(status?.refresh_status)) {
    reasons.push("refresh_status_unknown");
  }
  if (status?.refresh_status === "ok"
    && Date.parse(status.last_successful_refresh_at) > generatedTime) {
    reasons.push("publication_incomplete");
  }
  return {
    healthy: reasons.length === 0,
    reasons,
    observed_at: new Date(now).toISOString(),
    generated_at: generatedAt,
    refresh_checked_at: refreshCheckedAt,
    product_count: productCount,
    age_seconds: validTime(generatedTime) ? Math.max(0, Math.floor((now - generatedTime) / 1000)) : null,
    max_age_seconds: maxAgeMs / 1000,
  };
}
