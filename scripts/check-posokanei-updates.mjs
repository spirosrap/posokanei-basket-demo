#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { evaluateRefreshHealth } from "./refresh-health.mjs";

const DEFAULT_URL =
  "https://kalathitimon.com/api/update-status.php?refresh=1";
const statusUrl = process.env.POSOKANEI_UPDATE_URL || DEFAULT_URL;
const statePath = resolve(
  process.env.POSOKANEI_UPDATE_STATE || ".cache/posokanei-update-status.json",
);
const metaUrl = process.env.POSOKANEI_PUBLIC_META_URL
  || new URL("../data/catalog-meta.json", statusUrl).href;
const maxAgeMs = Number(process.env.POSOKANEI_MAX_AGE_SECONDS || 10800) * 1000;

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000);

try {
  const fetchJson = async (url) => {
    const freshUrl = new URL(url);
    freshUrl.searchParams.set("health_check", String(Date.now()));
    const response = await fetch(freshUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "agenticspiros-posokanei-update-check/1.0",
        "Cache-Control": "no-cache",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${freshUrl.pathname} returned HTTP ${response.status}`);
    }

    return response.json();
  };
  const [status, meta] = await Promise.all([fetchJson(statusUrl), fetchJson(metaUrl)]);
  const health = evaluateRefreshHealth(status, meta, { maxAgeMs });
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify({ ...status, health }, null, 2)}\n`, "utf8");

  const checkedAt = health.refresh_checked_at || "unknown";
  const sampledProducts = status.sampled_products ?? status.sampledProducts ?? 0;
  const changed = status.changed_since_last_check || status.changedSinceLastCheck;

  console.log(
    [
      `PosoKanei update check: ${health.healthy ? "healthy" : "unhealthy"}`,
      `reasons=${health.reasons.join(",") || "none"}`,
      `catalogue_at=${health.generated_at || "unknown"}`,
      `checked_at=${checkedAt}`,
      `changed=${changed ? "yes" : "no"}`,
      `active_products=${health.product_count}`,
      `sampled_products=${sampledProducts}`,
      `state=${statePath}`,
    ].join(" "),
  );
  if (!health.healthy) process.exitCode = 1;
} catch (error) {
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify({
    health: { healthy: false, reasons: ["health_check_failed"], observed_at: new Date().toISOString() },
    error: error.message,
  }, null, 2)}\n`, "utf8");
  console.error(`PosoKanei update check failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
