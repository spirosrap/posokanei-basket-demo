import assert from "node:assert/strict";
import test from "node:test";
import { normalizeUpdateStatus, resolveCatalogUpdatedAt } from "./updateStatus.js";

test("successful catalogue refresh wins over an older blocked proxy snapshot", () => {
  const status = normalizeUpdateStatus({
    checked_at: "2026-07-12T09:43:13.275Z",
    snapshot_generated_at: "2026-07-12T09:43:13.275Z",
    refresh_status: "failed",
    refresh_checked_at: "2026-07-26T18:37:14.868Z",
    last_successful_refresh_at: "2026-07-26T17:01:15.415Z",
  });

  assert.equal(status.refreshCheckedAt, "2026-07-26T18:37:14.868Z");
  assert.equal(status.lastSuccessfulRefreshAt, "2026-07-26T17:01:15.415Z");
  assert.equal(
    resolveCatalogUpdatedAt(
      { snapshotGeneratedAt: "2026-07-26T17:01:15.415Z" },
      status,
    ),
    "2026-07-26T17:01:15.415Z",
  );
});

test("catalogue update time falls back through health and proxy snapshot data", () => {
  assert.equal(
    resolveCatalogUpdatedAt(
      { snapshotGeneratedAt: "2026-07-25T10:00:00.000Z" },
      { snapshotGeneratedAt: "2026-07-24T10:00:00.000Z" },
    ),
    "2026-07-25T10:00:00.000Z",
  );
  assert.equal(
    resolveCatalogUpdatedAt({}, { snapshotGeneratedAt: "2026-07-24T10:00:00.000Z" }),
    "2026-07-24T10:00:00.000Z",
  );
});

test("a published catalogue supersedes an older failed refresh receipt", () => {
  const status = normalizeUpdateStatus({
    snapshot_generated_at: "2026-09-22T14:19:51.270Z",
    refresh_status: "failed",
    refresh_checked_at: "2026-09-22T13:16:59.093Z",
    refresh_error: "Catalogue refresh failed.",
    refresh_error_code: "timeout",
    last_successful_refresh_at: "2026-09-22T11:58:44.050Z",
  });

  assert.equal(status.refreshStatus, "ok");
  assert.equal(status.refreshError, "");
  assert.equal(status.refreshErrorCode, "");
  assert.equal(status.lastSuccessfulRefreshAt, "2026-09-22T14:19:51.270Z");
  assert.equal(resolveCatalogUpdatedAt({}, status), "2026-09-22T14:19:51.270Z");
});

test("catalogue coverage diagnostics survive status normalization", () => {
  const status = normalizeUpdateStatus({
    refresh_status: "failed",
    refresh_error_code: "catalog_coverage_degraded",
    refresh_diagnostics: {
      reason: "coverage-degraded",
      anomalies: [{ scope: "root_category", name: "Τρόφιμα" }],
    },
  });

  assert.equal(status.refreshErrorCode, "catalog_coverage_degraded");
  assert.equal(status.refreshDiagnostics.anomalies[0].name, "Τρόφιμα");
});
