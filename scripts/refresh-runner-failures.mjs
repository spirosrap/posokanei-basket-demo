import { appendFile, chmod, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export function captureCommandFailure(error, { command, code, signal, stdout = "", stderr = "" }) {
  return Object.assign(error, { command, exitCode: code ?? null, signal: signal || null, stdout, stderr });
}

export function diagnoseRefreshError(error) {
  const message = [error?.message, error?.stderr, error?.cause?.message, error?.cause?.code].filter(Boolean).join("\n");
  const stage = error?.refreshStage || "refresh";
  const source = stage === "source_probe" || stage === "source_fetch";
  const endpoint = message.match(/(?:https:\/\/api\.posokanei\.gov\.gr)?(\/(?:products\/search|meta\/(?:stats|categories|retailers|category-tree)))(?=[?\s:'"`]|$)/)?.[1];
  const http = Number(message.match(/returned HTTP (\d{3})/)?.[1]) || null;
  const timeout = /timed out|timeout|curl(?: exited with|: \()\s*28/i.test(message);
  let code = "refresh_failed";
  let summary = "Catalogue refresh failed; details retained locally.";
  if (["upstream_http_403", "refresh_runners_failed", "catalog_coverage_degraded", "catalog_contraction_blocked"].includes(error?.code)) {
    code = error.code;
    summary = {
      upstream_http_403: "All refresh runners returned HTTP 403.",
      refresh_runners_failed: "All refresh runners failed; see runner diagnostics.",
      catalog_coverage_degraded: "The upstream catalogue lost category, retailer, or offer coverage; the previous catalogue was retained.",
      catalog_contraction_blocked: "The upstream catalogue contracted beyond the safety limit; the previous catalogue was retained.",
    }[code];
  } else if (/Permission denied \(publickey|Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/i.test(message)) {
    code = "runner_ssh_auth_failed";
    summary = "Refresh runner SSH authentication or host verification failed.";
  } else if (error?.exitCode === 255 || /ssh exited with 255|Connection timed out during banner exchange|UNKNOWN port 65535/i.test(message)) {
    code = "runner_ssh_failed";
    summary = timeout ? "Refresh runner SSH connection timed out." : "Refresh runner SSH connection failed.";
  } else if (/node: (?:command )?not found|node: No such file|Cannot find (?:module|package)|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND/i.test(message)) {
    code = "runner_runtime_failed";
    summary = "Refresh runner Node.js runtime or required module is unavailable.";
  } else if (http) {
    const upstream = source || Boolean(endpoint);
    code = upstream ? `upstream_http_${http}` : "catalog_http_failed";
    summary = `${upstream ? `PosoKanei${endpoint ? ` ${endpoint}` : ""}` : "Hosted catalogue"} returned HTTP ${http}.`;
  } else if (timeout) {
    code = source ? "upstream_timeout" : stage === "publication" ? "publication_timeout" : "timeout";
    summary = source ? `PosoKanei${endpoint ? ` ${endpoint}` : ""} request timed out.`
      : stage === "publication" ? "Catalogue publication timed out."
        : "Catalogue refresh operation timed out.";
  } else if (source && /curl|fetch failed|ECONN|ENOTFOUND|UND_ERR/i.test(message)) {
    code = "upstream_connection_failed";
    summary = `Connection to PosoKanei${endpoint ? ` ${endpoint}` : ""} failed.`;
  } else if (stage === "catalog_preflight" || stage === "catalog_verification") {
    code = "catalog_verification_failed";
    summary = "Hosted catalogue verification failed.";
  } else if (stage === "publication") {
    code = "publication_failed";
    summary = "Catalogue publication failed.";
  } else if (stage.startsWith("runner_")) {
    code = "runner_operation_failed";
    summary = "Refresh runner setup or file transfer failed; details retained locally.";
  } else if (source) {
    summary = "Refresh runner source check or catalogue build failed; details retained locally.";
  }
  return {
    error_code: code, error: summary, stage,
    ...(endpoint && source ? { endpoint } : {}),
    ...(Number.isInteger(error?.exitCode) ? { exit_code: error.exitCode } : {}),
    ...(typeof error?.signal === "string" && /^SIG[A-Z0-9]+$/.test(error.signal) ? { signal: error.signal } : {}),
  };
}

export function describeRefreshError(error) { return diagnoseRefreshError(error).error; }
export function refreshErrorCode(error) { return diagnoseRefreshError(error).error_code; }

export async function tryRefreshHosts(hosts, attempt, onFailure) {
  const failures = [];
  for (const [index, host] of [...new Set(hosts)].entries()) {
    try {
      return await attempt(host, index);
    } catch (error) {
      const failure = diagnoseRefreshError(error);
      failures.push(failure);
      await onFailure(host, index, error);
      if (["upstream_http_401", "upstream_http_403", "upstream_http_429"].includes(failure.error_code)) {
        error.refreshDiagnostics = buildRunnerFailure(failures).refreshDiagnostics;
        error.refreshDiagnostics.reason = "upstream-declined";
        throw error;
      }
    }
  }
  throw buildRunnerFailure(failures);
}

export function redactDiagnosticText(value) {
  return String(value ?? "")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, "$1[REDACTED]@")
    .replace(/(authorization\s*:\s*)(?:Bearer|Basic)\s+[^\s'"\\]+/gi, "$1[REDACTED]")
    .replace(/((?:[a-z0-9_]*(?:password|passwd|secret|token|api_key|ftp_pass)[a-z0-9_]*)["']?\s*[:=]\s*)("[^"\n]*"|'[^'\n]*'|[^\s&,;]+)/gi, "$1[REDACTED]");
}

export function runnerFailureRecord(host, error, { runId, runner, now = new Date().toISOString() } = {}) {
  const detail = (value) => {
    const safe = redactDiagnosticText(value);
    return safe.length > 65536 ? `${safe.slice(0, 32768)}\n[TRUNCATED]\n${safe.slice(-32768)}` : safe;
  };
  return {
    run_id: runId, runner, host, observed_at: now, status: "failed",
    ...diagnoseRefreshError(error),
    message: detail(error?.message || error),
    stderr: detail(error?.stderr), stdout: detail(error?.stdout),
    stack: detail(error?.stack),
    cause: error?.cause ? detail(error.cause.stack || error.cause.message || error.cause) : "",
  };
}

export async function appendRunnerDiagnostic(path, record) {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

export function buildRunnerFailure(failures) {
  const allBlocked = failures.length > 0
    && failures.every((failure) => failure.error_code === "upstream_http_403");
  const error = new Error(allBlocked
    ? "All refresh runners returned HTTP 403."
    : "All refresh runners failed.");
  error.code = allBlocked ? "upstream_http_403" : "refresh_runners_failed";
  error.refreshDiagnostics = {
    reason: allBlocked ? "upstream-access-denied" : "all-refresh-runners-failed",
    // Public diagnostics use ordinal numbers, never SSH addresses or raw stderr.
    runners: failures.map((failure, index) => ({
      runner: index + 1,
      error_code: failure.error_code,
      error: failure.error,
      ...(failure.stage ? { stage: failure.stage } : {}),
      ...(failure.endpoint ? { endpoint: failure.endpoint } : {}),
      ...(Number.isInteger(failure.exit_code) ? { exit_code: failure.exit_code } : {}),
      ...(failure.signal ? { signal: failure.signal } : {}),
    })),
  };
  return error;
}
