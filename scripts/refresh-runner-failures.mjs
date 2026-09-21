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
    })),
  };
  return error;
}
