import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";

const DEFAULT_STALE_AFTER_MS = 50 * 60 * 1000;

export async function acquireRefreshLock(
  lockPath,
  { retried = false, staleAfterMs = DEFAULT_STALE_AFTER_MS } = {},
) {
  await mkdir(dirname(lockPath), { recursive: true });
  try {
    const handle = await open(lockPath, "wx");
    const owner = {
      pid: process.pid,
      started_at: new Date().toISOString(),
      token: randomUUID(),
    };
    await handle.writeFile(`${JSON.stringify(owner)}\n`);
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      try {
        const currentOwner = JSON.parse(await readFile(lockPath, "utf8"));
        if (currentOwner?.token === owner.token) {
          await unlink(lockPath).catch(() => {});
        }
      } catch {
        // A missing or replaced lock belongs to no longer-running work or a successor.
      } finally {
        await handle.close();
      }
    };
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    if (!retried) {
      const details = await stat(lockPath).catch(() => null);
      const ownerRunning = await refreshLockOwnerIsRunning(lockPath);
      if (
        !ownerRunning
        || (details && Date.now() - details.mtimeMs > staleAfterMs)
      ) {
        await unlink(lockPath).catch(() => {});
        return acquireRefreshLock(lockPath, { retried: true, staleAfterMs });
      }
    }
    return null;
  }
}

export async function refreshLockOwnerIsRunning(lockPath) {
  try {
    const details = JSON.parse(await readFile(lockPath, "utf8"));
    const pid = Number(details?.pid);
    if (!Number.isInteger(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}
