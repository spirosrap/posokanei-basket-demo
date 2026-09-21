import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);

test("the checker exits nonzero for stale HTTP 200 data, recovers, and overwrites old success on network failure", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "posokanei-health-"));
  const statePath = join(directory, "status.json");
  t.after(() => rm(directory, { recursive: true, force: true }));
  let generatedAt = new Date(Date.now() - 48 * 3600000).toISOString();
  let failed = true;
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(request.url.startsWith("/data/")
      ? { generated_at: generatedAt, stats: { active_products: 10394 } }
      : {
        status: "snapshot", error: "live_proxy_blocked",
        refresh_status: failed ? "failed" : "ok",
        refresh_error_code: failed ? "upstream_http_403" : "",
        refresh_checked_at: new Date().toISOString(),
        last_successful_refresh_at: generatedAt,
      }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const env = {
    ...process.env,
    POSOKANEI_UPDATE_URL: `http://127.0.0.1:${server.address().port}/api/update-status.php`,
    POSOKANEI_UPDATE_STATE: statePath,
    POSOKANEI_MAX_AGE_SECONDS: "10800",
  };
  delete env.POSOKANEI_PUBLIC_META_URL;
  const check = () => run(process.execPath, ["scripts/check-posokanei-updates.mjs"], { env, timeout: 10000 });
  await assert.rejects(check(), (error) => error.code === 1);
  assert.deepEqual(JSON.parse(await readFile(statePath)).health.reasons, ["catalog_stale", "upstream_http_403"]);
  failed = false;
  generatedAt = new Date().toISOString();
  await check();
  assert.equal(JSON.parse(await readFile(statePath)).health.healthy, true);
  await new Promise((resolve) => server.close(resolve));
  await assert.rejects(check(), (error) => error.code === 1);
  assert.deepEqual(JSON.parse(await readFile(statePath)).health.reasons, ["health_check_failed"]);
});
