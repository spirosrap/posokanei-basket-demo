export function normalizeUpdateStatus(raw = {}) {
  const snapshotGeneratedAt = raw.snapshot_generated_at || raw.snapshotGeneratedAt || "";
  const refreshCheckedAt = raw.refresh_checked_at || raw.refreshCheckedAt || "";
  const refreshStatus = raw.refresh_status || raw.refreshStatus || "";
  const failureIsStale = catalogueSupersedesFailure(
    refreshStatus,
    refreshCheckedAt,
    snapshotGeneratedAt,
  );

  return {
    checkedAt: raw.checked_at || raw.checkedAt || "",
    changedSinceLastCheck: Boolean(raw.changed_since_last_check ?? raw.changedSinceLastCheck),
    activeProducts: Number(raw.stats?.active_products ?? raw.activeProducts ?? 0) || 0,
    sampledProducts: Number(raw.sampled_products ?? raw.sampledProducts ?? 0) || 0,
    fingerprint: raw.fingerprint || "",
    status: raw.status || "ok",
    error: raw.error || "",
    detail: raw.detail || "",
    snapshotGeneratedAt,
    refreshStatus: failureIsStale ? "ok" : refreshStatus,
    refreshCheckedAt,
    refreshError: failureIsStale ? "" : (raw.refresh_error || raw.refreshError || ""),
    refreshErrorCode: failureIsStale ? "" : (raw.refresh_error_code || raw.refreshErrorCode || ""),
    refreshDiagnostics: failureIsStale
      ? null
      : (raw.refresh_diagnostics || raw.refreshDiagnostics || null),
    lastSuccessfulRefreshAt: failureIsStale
      ? snapshotGeneratedAt
      : raw.last_successful_refresh_at
        || raw.lastSuccessfulRefreshAt
        || snapshotGeneratedAt
        || "",
  };
}

function catalogueSupersedesFailure(refreshStatus, refreshCheckedAt, snapshotGeneratedAt) {
  if (refreshStatus !== "failed") return false;
  const checkedAt = Date.parse(refreshCheckedAt || "");
  const publishedAt = Date.parse(snapshotGeneratedAt || "");
  return Number.isFinite(checkedAt) && Number.isFinite(publishedAt) && checkedAt < publishedAt;
}

export function resolveCatalogUpdatedAt(health, updateStatus) {
  return updateStatus?.lastSuccessfulRefreshAt
    || health?.snapshotGeneratedAt
    || updateStatus?.snapshotGeneratedAt
    || "";
}
