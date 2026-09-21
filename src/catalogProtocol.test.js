import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);

test("the real preflight client uses HTTP/1.1 and never rewrites a catalogue", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "posokanei-protocol-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "curl"), `#!/bin/sh
case " $* " in
  *" --http1.1 "*) printf '%s' '{"active_products":10436}
__POSOKANEI_HTTP_STATUS__:200' ;;
  *) printf '%s' 'Forbidden
__POSOKANEI_HTTP_STATUS__:403' ;;
esac
printf '%s\\n' "$*" >> "$PROBE_REQUEST_LOG"
`, { mode: 0o700 });
  const output = join(directory, "catalog.json");
  const requests = join(directory, "requests.txt");
  await run(process.execPath, ["scripts/build-catalog-snapshot.mjs", "--probe-only"], {
    env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, POSOKANEI_SNAPSHOT_OUT: output, PROBE_REQUEST_LOG: requests },
    timeout: 10000,
  });
  const requestLog = await readFile(requests, "utf8");
  assert.equal(requestLog.split("https://api.posokanei.gov.gr/meta/stats").length - 1, 1);
  await assert.rejects(access(output), { code: "ENOENT" });
});
