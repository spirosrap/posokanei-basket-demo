import assert from "node:assert/strict";
import test from "node:test";
import { friendlyRefreshError, normalizeUpdateStatus, resolveCatalogUpdatedAt } from "./updateStatus.js";
import { translate } from "./i18n.js";

test("a successful partial refresh still exposes the missing chain", () => {
  const unavailable = [{ id: "lidl", name: "Lidl" }];
  assert.deepEqual(normalizeUpdateStatus({ refresh_status: "ok", catalog_availability: { unavailable_retailers: unavailable } }).unavailableRetailers, unavailable);
  assert.deepEqual(normalizeUpdateStatus({}).unavailableRetailers, []);
});

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

test("refresh warnings distinguish source failures, runner failures, and publication", () => {
  const t = (key) => key;
  assert.equal(friendlyRefreshError("request timed out", t, "upstream_timeout"), "upstreamTimedOut");
  assert.equal(friendlyRefreshError("FTP timed out", t, "publication_timeout"), "publicationTimedOut");
  assert.equal(friendlyRefreshError("fetch failed", t, "catalog_verification_failed"), "catalogVerificationFailed");
  assert.equal(friendlyRefreshError("mixed failures including HTTP 403", t, "refresh_runners_failed"), "refreshRunnersFailed");
  assert.equal(friendlyRefreshError("node not found", t, "runner_runtime_failed"), "refreshRunnerFailed");
  assert.equal(friendlyRefreshError("Catalogue publication timed out.", t, "timeout"), "checkIncomplete");
  for (const language of ["el", "en"]) {
    assert.doesNotMatch(translate(language, "refreshFailedTitle"), /PosoKanei/);
    assert.doesNotMatch(translate(language, "lastAttemptFailed"), /PosoKanei/);
  }
});
