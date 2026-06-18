#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DEFAULT_URL =
  "https://agenticspiros.com/demo/posokanei-basket/api/update-status.php?refresh=1";
const statusUrl = process.env.POSOKANEI_UPDATE_URL || DEFAULT_URL;
const statePath = resolve(
  process.env.POSOKANEI_UPDATE_STATE || ".cache/posokanei-update-status.json",
);

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000);

try {
  const response = await fetch(statusUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "agenticspiros-posokanei-update-check/1.0",
    },
    signal: controller.signal,
  });

  if (!response.ok) {
    throw new Error(`Update endpoint returned HTTP ${response.status}`);
  }

  const status = await response.json();
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(status, null, 2)}\n`, "utf8");

  const checkedAt = status.checked_at || status.checkedAt || "unknown";
  const sampledProducts = status.sampled_products ?? status.sampledProducts ?? 0;
  const activeProducts =
    status.stats?.active_products ?? status.activeProducts ?? "unknown";
  const changed = status.changed_since_last_check || status.changedSinceLastCheck;

  console.log(
    [
      `PosoKanei update check: ${status.status || "ok"}`,
      `checked_at=${checkedAt}`,
      `changed=${changed ? "yes" : "no"}`,
      `active_products=${activeProducts}`,
      `sampled_products=${sampledProducts}`,
      `state=${statePath}`,
    ].join(" "),
  );
} catch (error) {
  console.error(`PosoKanei update check failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
