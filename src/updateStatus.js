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
    unavailableRetailers: raw.catalog_availability?.unavailable_retailers || [],
    hasKritikosPrices: raw.has_kritikos_prices ?? null,
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

export function friendlyRefreshError(error, t, errorCode = "") {
  const keys = {
    catalog_coverage_degraded: "catalogueCoverageDegraded",
    catalog_contraction_blocked: "catalogueCoverageDegraded",
    upstream_http_403: "upstreamBlocked",
    upstream_timeout: "upstreamTimedOut",
    upstream_connection_failed: "upstreamConnectionFailed",
    publication_timeout: "publicationTimedOut",
    publication_failed: "publicationFailed",
    catalog_verification_failed: "catalogVerificationFailed",
    refresh_runners_failed: "refreshRunnersFailed",
    runner_ssh_failed: "refreshRunnerFailed",
    runner_ssh_auth_failed: "refreshRunnerFailed",
    runner_runtime_failed: "refreshRunnerFailed",
    runner_operation_failed: "refreshRunnerFailed",
  };
  if (keys[errorCode]) return t(keys[errorCode]);
  if (String(error || "").includes("HTTP 403")) return t("upstreamBlocked");
  // Older receipts did not distinguish source timeouts from publication timeouts.
  return t("checkIncomplete");
}
