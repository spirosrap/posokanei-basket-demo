export function normalizeUpdateStatus(raw = {}) {
  return {
    checkedAt: raw.checked_at || raw.checkedAt || "",
    changedSinceLastCheck: Boolean(raw.changed_since_last_check ?? raw.changedSinceLastCheck),
    activeProducts: Number(raw.stats?.active_products ?? raw.activeProducts ?? 0) || 0,
    sampledProducts: Number(raw.sampled_products ?? raw.sampledProducts ?? 0) || 0,
    fingerprint: raw.fingerprint || "",
    status: raw.status || "ok",
    error: raw.error || "",
    detail: raw.detail || "",
    snapshotGeneratedAt: raw.snapshot_generated_at || raw.snapshotGeneratedAt || "",
    refreshStatus: raw.refresh_status || raw.refreshStatus || "",
    refreshCheckedAt: raw.refresh_checked_at || raw.refreshCheckedAt || "",
    refreshError: raw.refresh_error || raw.refreshError || "",
    refreshErrorCode: raw.refresh_error_code || raw.refreshErrorCode || "",
    refreshDiagnostics: raw.refresh_diagnostics || raw.refreshDiagnostics || null,
    lastSuccessfulRefreshAt:
      raw.last_successful_refresh_at
      || raw.lastSuccessfulRefreshAt
      || raw.snapshot_generated_at
      || raw.snapshotGeneratedAt
      || "",
  };
}

export function resolveCatalogUpdatedAt(health, updateStatus) {
  return updateStatus?.lastSuccessfulRefreshAt
    || health?.snapshotGeneratedAt
    || updateStatus?.snapshotGeneratedAt
    || "";
}
