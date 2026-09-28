import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRefreshHealth } from "../scripts/refresh-health.mjs";

const now = Date.parse("2026-09-21T12:00:00Z");
const meta = { generated_at: "2026-09-21T11:00:00Z", stats: { active_products: 10394 } };
const status = {
  status: "snapshot", error: "live_proxy_blocked",
  refresh_status: "ok", refresh_checked_at: "2026-09-21T11:05:00Z",
  last_successful_refresh_at: meta.generated_at,
};

test("fresh partial publication reports the missing retailer rather than stale prices", () => {
  const result = evaluateRefreshHealth(status, { ...meta, availability: { unavailable_retailers: [{ id: "lidl" }] } }, { now });
  assert.equal(result.healthy, false);
  assert.deepEqual(result.reasons, ["retailer_unavailable"]);
});

test("fresh scheduled data stays healthy despite the known Plesk live-proxy block", () => {
  assert.equal(evaluateRefreshHealth(status, meta, { now }).healthy, true);
});

test("HTTP 200 with the September 19 snapshot and current 403 failures is unhealthy", () => {
  const result = evaluateRefreshHealth({ ...status, refresh_status: "failed", refresh_error_code: "upstream_http_403" },
    { ...meta, generated_at: "2026-09-19T07:25:27.685Z" }, { now });
  assert.equal(result.healthy, false);
  assert.deepEqual(result.reasons, ["catalog_stale", "upstream_http_403"]);
});

test("a stopped scheduler is detected even if its last receipt said ok", () => {
  const result = evaluateRefreshHealth({ ...status, refresh_checked_at: "2026-09-19T07:30:00Z" }, meta, { now });
  assert.ok(result.reasons.includes("scheduler_stalled"));
});

test("malformed, missing, future and empty catalogue data cannot pass health checks", () => {
  for (const generated_at of ["", "nonsense", "2026-09-22T12:00:00Z"]) {
    assert.equal(evaluateRefreshHealth(status, { generated_at }, { now }).healthy, false);
  }
  assert.equal(evaluateRefreshHealth({}, meta, { now }).healthy, false);
  assert.equal(evaluateRefreshHealth(status, { ...meta, stats: {} }, { now }).healthy, false);
});

test("recovery clears failures and an older failure receipt is historical", () => {
  assert.equal(evaluateRefreshHealth({ ...status, refresh_status: "failed", refresh_checked_at: "2026-09-21T10:00:00Z" }, meta, { now }).healthy, true);
  assert.equal(evaluateRefreshHealth(status, meta, { now }).healthy, true);
});

test("an ok receipt claiming newer prices than the public catalogue fails", () => {
  assert.ok(evaluateRefreshHealth({ ...status, last_successful_refresh_at: "2026-09-21T11:30:00Z" }, meta, { now }).reasons.includes("publication_incomplete"));
});
