import assert from "node:assert/strict";
import test from "node:test";
import { buildRunnerFailure } from "../scripts/refresh-runner-failures.mjs";

test("all denied runners report an upstream outage with every result retained", () => {
  const failures = Array.from({ length: 3 }, () => ({ error_code: "upstream_http_403", error: "Upstream returned HTTP 403" }));
  const error = buildRunnerFailure(failures);
  assert.equal(error.code, "upstream_http_403");
  assert.equal(error.refreshDiagnostics.runners.length, 3);
  assert.deepEqual(error.refreshDiagnostics.runners.map((result) => result.runner), [1, 2, 3]);
});

test("a last-runner timeout does not erase earlier upstream denial evidence", () => {
  const error = buildRunnerFailure([
    { error_code: "upstream_http_403", error: "Upstream returned HTTP 403" },
    { error_code: "timeout", error: "Refresh runner SSH connection timed out." },
  ]);
  assert.equal(error.code, "refresh_runners_failed");
  assert.deepEqual(error.refreshDiagnostics.runners.map((result) => result.error_code), ["upstream_http_403", "timeout"]);
});
