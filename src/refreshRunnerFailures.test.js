import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { runRefreshCommand } from "../scripts/refresh-command.mjs";
import {
  appendRunnerDiagnostic, buildRunnerFailure, captureCommandFailure,
  diagnoseRefreshError, redactDiagnosticText, runnerFailureRecord, tryRefreshHosts,
} from "../scripts/refresh-runner-failures.mjs";

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

function commandFailure(stderr, stage, code = 1) {
  return Object.assign(captureCommandFailure(new Error(`ssh exited with ${code}: ${stderr}`), {
    command: "ssh", code, stdout: "probe started\n", stderr,
  }), { refreshStage: stage });
}

test("fleet skips unreachable runners once, stops at the first complete download", async () => {
  const attempted = [], failed = [];
  const result = await tryRefreshHosts(["sleeping", "sleeping", "broken", "working", "spare"], async (host) => {
    attempted.push(host);
    if (host !== "working") throw new Error("runner unavailable");
    return "catalogue";
  }, async (host) => failed.push(host));
  assert.equal(result, "catalogue");
  assert.deepEqual(attempted, ["sleeping", "broken", "working"]);
  assert.deepEqual(failed, ["sleeping", "broken"]);
});

test("source rate limit stops the fleet rather than changing machines", async () => {
  const attempted = [];
  await assert.rejects(tryRefreshHosts(["a", "b"], async (host) => {
    attempted.push(host);
    throw commandFailure("/meta/stats returned HTTP 429", "source_fetch");
  }, async () => {}), /HTTP 429/);
  assert.deepEqual(attempted, ["a"]);
});

test("real quiet subprocess failures preserve both output streams and exit status", async () => {
  await assert.rejects(runRefreshCommand(process.execPath, ["-e", 'process.stdout.write("probe started"); process.stderr.write("actual probe failure"); process.exit(42);'], { quiet: true }), (error) => {
    assert.equal(error.exitCode, 42);
    assert.equal(error.stdout, "probe started");
    assert.equal(error.stderr, "actual probe failure");
    assert.match(error.message, /actual probe failure/);
    return true;
  });
  await assert.rejects(runRefreshCommand(process.execPath, ["-e", 'process.kill(process.pid, "SIGTERM")'], { quiet: true }), (error) => {
    assert.equal(error.signal, "SIGTERM");
    return true;
  });
  await assert.rejects(runRefreshCommand("/nonexistent/refresh-command", [], { quiet: true }), { code: "ENOENT" });
  await runRefreshCommand("/nonexistent/refresh-cleanup", [], { quiet: true, allowFailure: true });
});

test("source timeouts never claim that publication failed", () => {
  const error = commandFailure(
    "Command failed: curl https://api.posokanei.gov.gr/products/search\ncurl: (28) Operation timed out after 30001 milliseconds with 0 bytes received",
    "source_fetch",
  );
  assert.deepEqual(diagnoseRefreshError(error), {
    error_code: "upstream_timeout", error: "PosoKanei /products/search request timed out.",
    stage: "source_fetch", endpoint: "/products/search", exit_code: 1,
  });
  error.refreshStage = "publication";
  assert.equal(diagnoseRefreshError(error).error_code, "publication_timeout");
  assert.equal(diagnoseRefreshError(error).error, "Catalogue publication timed out.");
  delete error.refreshStage;
  assert.doesNotMatch(diagnoseRefreshError(error).error, /publication/i);
});

test("quiet probes preserve endpoint HTTP errors and local runner failures separately", () => {
  assert.equal(diagnoseRefreshError(commandFailure("Error: /meta/stats returned HTTP 403", "source_probe")).error_code, "upstream_http_403");
  assert.equal(diagnoseRefreshError(commandFailure("Error: /products/search returned HTTP 503", "source_fetch")).error_code, "upstream_http_503");
  assert.equal(diagnoseRefreshError(commandFailure("node: command not found", "source_probe", 127)).error_code, "runner_runtime_failed");
  assert.equal(diagnoseRefreshError(commandFailure("Cannot find module '/tmp/private-module.mjs'", "source_probe")).error_code, "runner_runtime_failed");
  assert.equal(diagnoseRefreshError(commandFailure("Connection timed out during banner exchange", "runner_setup", 255)).error_code, "runner_ssh_failed");
  assert.equal(diagnoseRefreshError(commandFailure("Permission denied (publickey)", "runner_setup", 255)).error_code, "runner_ssh_auth_failed");
  assert.equal(diagnoseRefreshError(commandFailure("scp: disk full on private-runner", "runner_download")).error_code, "runner_operation_failed");
});

test("hosted catalogue verification and FTP errors do not blame PosoKanei", () => {
  const error = Object.assign(new Error("catalogue returned HTTP 503"), { refreshStage: "catalog_preflight" });
  assert.equal(diagnoseRefreshError(error).error, "Hosted catalogue returned HTTP 503.");
  error.message = "Could not verify previous catalogue: fetch failed";
  assert.equal(diagnoseRefreshError(error).error_code, "catalog_verification_failed");
  error.refreshStage = "publication";
  error.message = "/usr/bin/curl exited with 28: FTP response timeout";
  assert.equal(diagnoseRefreshError(error).error_code, "publication_timeout");
});

test("unknown quiet errors remain available privately but cannot leak through public diagnostics", () => {
  const error = commandFailure("unusual failure on private-runner at /home/private/path", "source_probe", 42);
  const record = runnerFailureRecord("private-runner", error, { runId: "run-1", runner: 2 });
  assert.equal(record.exit_code, 42);
  assert.equal(record.stderr, error.stderr);
  assert.equal(record.stdout, "probe started\n");
  assert.match(record.message, /unusual failure/);
  const publicJson = JSON.stringify(buildRunnerFailure([record]).refreshDiagnostics);
  assert.doesNotMatch(publicJson, /private-runner|\/home\/private|unusual failure|stderr|stdout|stack/);
  assert.match(publicJson, /source_probe/);
  assert.match(publicJson, /42/);
});

test("signal and spawn failures retain their original evidence", () => {
  const signalled = commandFailure("connection lost", "source_fetch", null);
  signalled.signal = "SIGTERM";
  assert.equal(diagnoseRefreshError(signalled).signal, "SIGTERM");
  const spawnError = captureCommandFailure(Object.assign(new Error("spawn ssh ENOENT"), { code: "ENOENT" }), { command: "ssh" });
  assert.match(runnerFailureRecord("runner", spawnError).message, /ENOENT/);
});

test("private diagnostics redact credentials while retaining the actual failure", () => {
  const text = 'curl: (6) Could not resolve host; https://user:password@example.test/path?token=abc123&ok=1 Authorization: Bearer bearer-value FTP_PASS="another secret"';
  const safe = redactDiagnosticText(text);
  assert.match(safe, /Could not resolve host/);
  assert.doesNotMatch(safe, /user:password|abc123|bearer-value|another secret/);
});

test("runner history survives a successful fallback and later runs with private permissions", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "runner-diagnostics-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "private", "diagnostics.jsonl");
  const failure = runnerFailureRecord("runner-a", commandFailure("Error: /meta/stats returned HTTP 403", "source_probe"), { runId: "run-1", runner: 1 });
  await appendRunnerDiagnostic(path, failure);
  await appendRunnerDiagnostic(path, { run_id: "run-1", runner: 2, host: "runner-b", status: "ok" });
  await appendRunnerDiagnostic(path, { run_id: "run-2", runner: 1, host: "runner-a", status: "ok" });
  const records = (await readFile(path, "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(records.length, 3);
  assert.equal(records[0].stderr, failure.stderr);
  assert.equal(records[0].run_id, records[1].run_id);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
});
