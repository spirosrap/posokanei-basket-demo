import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { acquireRefreshLock } from "../scripts/refresh-lock.mjs";

test("refresh locks block overlapping catalogue work and release their own file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "posokanei-refresh-lock-"));
  const lockPath = join(directory, "refresh.lock");
  try {
    const release = await acquireRefreshLock(lockPath);
    assert.equal(typeof release, "function");
    assert.equal(await acquireRefreshLock(lockPath), null);

    await release();
    await assert.rejects(readFile(lockPath, "utf8"), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("an old refresh cannot delete a successor lock during release", async () => {
  const directory = await mkdtemp(join(tmpdir(), "posokanei-refresh-lock-race-"));
  const lockPath = join(directory, "refresh.lock");
  try {
    const release = await acquireRefreshLock(lockPath);
    await unlink(lockPath);
    const successor = {
      pid: globalThis.process.pid,
      started_at: new Date().toISOString(),
      token: "successor-token",
    };
    await writeFile(lockPath, `${JSON.stringify(successor)}\n`, "utf8");

    await release();
    assert.deepEqual(JSON.parse(await readFile(lockPath, "utf8")), successor);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
