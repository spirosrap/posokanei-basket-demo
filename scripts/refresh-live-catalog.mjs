#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { collectReportedImageIds } from "./catalog-image-fallbacks.mjs";
import { uploadFileAtomic } from "./ftp-atomic-upload.mjs";
import { writeCompressedVariants } from "./precompress-assets.mjs";
import { acquireRefreshLock } from "./refresh-lock.mjs";
import {
  inspectPriceChangesCsv,
  inspectPriceChangesJson,
  PRICE_CHANGES_PREVIEW_LIMIT,
} from "./price-change-export.mjs";
import { writeProductDetailsJsonl } from "./catalog-details.mjs";
import { resolveRefreshOutputPaths } from "./refresh-output-paths.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadLocalEnv(resolve(projectRoot, ".env.local"));
const uploadEnabled = !process.argv.includes("--no-upload");
const compressionOnly = process.argv.includes("--compression-only");
const imagesOnly = process.argv.includes("--images-only");
if (compressionOnly && imagesOnly) {
  throw new Error("--compression-only and --images-only cannot be used together.");
}
const {
  snapshotPath,
  metaPath,
  runtimePath,
  bootstrapPath,
  priceChangesPath,
  priceChangesJsonPath,
  priceChangesPreviewPath,
  priceChangesGzipPath,
  productDetailsPath,
  refreshStatusPath,
  dailyBargainPath,
} = resolveRefreshOutputPaths({
  projectRoot,
  env: process.env,
  compressionOnly,
});
const ftpTargets = buildFtpTargets();
const primaryTarget = ftpTargets[0];
const remoteRefreshHost = process.env.POSOKANEI_REFRESH_HOST || "";
const remoteRefreshHosts = parseRefreshHosts(
  process.env.POSOKANEI_REFRESH_HOSTS || remoteRefreshHost,
);
const minimumProducts = Number(process.env.POSOKANEI_MIN_PRODUCTS || 1000);
const publicCatalogUrl =
  process.env.POSOKANEI_PUBLIC_CATALOG_URL ||
  publicDataUrl(primaryTarget, "catalog.json");
const publicMetaUrl =
  process.env.POSOKANEI_PUBLIC_META_URL || publicCatalogUrl.replace(/catalog\.json$/, "catalog-meta.json");
const refreshLockPath = resolve(
  projectRoot,
  process.env.POSOKANEI_REFRESH_LOCK || ".cache/catalog-refresh.lock",
);
const previousSnapshotCachePath = resolve(
  projectRoot,
  process.env.POSOKANEI_PREVIOUS_SNAPSHOT_CACHE || ".cache/catalog-previous.json",
);
const configuredPreviousSnapshotPath = process.env.POSOKANEI_PREVIOUS_SNAPSHOT
  ? resolve(projectRoot, process.env.POSOKANEI_PREVIOUS_SNAPSHOT)
  : "";
const imageFallbackOutputDir = resolve(
  projectRoot,
  process.env.POSOKANEI_IMAGE_FALLBACK_OUT
    || ".cache/catalog-refresh-output/image-fallbacks",
);
const imageFallbackSummaryPath = resolve(
  projectRoot,
  process.env.POSOKANEI_IMAGE_FALLBACK_SUMMARY
    || ".cache/catalog-refresh-output/image-fallback-summary.json",
);
const imageFallbackStatePath = resolve(
  projectRoot,
  process.env.POSOKANEI_IMAGE_FALLBACK_STATE
    || ".cache/catalog-image-fallback-state.json",
);
const maximumPublishedImageFallbackBytes = 6 * 1024 * 1024;
let detailVerificationProductId = "";
let compressedPublicationFiles = [];
let imageFallbackPublicationFiles = [];
let reportedImageIds = [];

const releaseRefreshLock = await acquireRefreshLock(refreshLockPath);
if (!releaseRefreshLock) {
  console.log("Another catalogue refresh is already running; this overlapping run was skipped.");
} else {
  try {
    if (compressionOnly) await deployCurrentCatalogueCompression();
    else if (imagesOnly) await publishCurrentImageFallbacks();
    else await refreshCatalog();
  } catch (error) {
    if (!compressionOnly && !imagesOnly) await recordRefreshFailure(error);
    throw error;
  } finally {
    await releaseRefreshLock();
  }
}

async function publishCurrentImageFallbacks() {
  const summary = JSON.parse(await readFile(imageFallbackSummaryPath, "utf8"));
  imageFallbackPublicationFiles = normalizeImageFallbackFiles(
    summary.files,
    imageFallbackOutputDir,
  );
  imageFallbackPublicationFiles = await optimizeLargeImageFallbacks(
    imageFallbackPublicationFiles,
  );
  if (!imageFallbackPublicationFiles.length) {
    throw new Error("No validated image fallbacks are staged for publication.");
  }
  if (!uploadEnabled) {
    console.log(
      `Validated ${imageFallbackPublicationFiles.length} staged image fallback(s); upload skipped.`,
    );
    return;
  }

  for (const target of ftpTargets) {
    try {
      const password = await readTargetPassword(target);
      await publishImageFallbackFiles(target, password, { strict: true });
    } catch (error) {
      if (target.required) throw error;
      console.error(`Optional image mirror ${target.name} failed: ${describeRefreshError(error)}`);
    }
  }
}

async function deployCurrentCatalogueCompression() {
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  const expectedGeneratedAt = snapshot.generated_at || "";
  const productCount = Array.isArray(snapshot.products) ? snapshot.products.length : 0;
  if (!expectedGeneratedAt || productCount < minimumProducts) {
    throw new Error("Local catalogue data is not valid for compression-only publication.");
  }

  const timestampedFiles = [
    metaPath,
    runtimePath,
    bootstrapPath,
    priceChangesJsonPath,
    priceChangesPreviewPath,
  ];
  for (const filePath of timestampedFiles) {
    const data = JSON.parse(await readFile(filePath, "utf8"));
    if (data.generated_at !== expectedGeneratedAt) {
      throw new Error(`Local catalogue timestamp mismatch in ${filePath}.`);
    }
  }
  if (existsSync(dailyBargainPath)) {
    const bargain = JSON.parse(await readFile(dailyBargainPath, "utf8"));
    if (!bargain.generated_at || !bargain.catalog_generated_at) {
      throw new Error("Local daily bargain is incomplete.");
    }
  }

  compressedPublicationFiles = await writeCatalogueCompressionVariants();
  if (!uploadEnabled) {
    console.log("Compression-only upload skipped because --no-upload was passed.");
    return;
  }

  for (const target of ftpTargets) {
    try {
      const targetCatalogUrl = target.publicCatalogUrl || publicDataUrl(target, "catalog.json");
      const publicMeta = await fetchPublicJson(
        targetCatalogUrl.replace(/catalog\.json$/u, "catalog-meta.json"),
      );
      if (publicMeta.generated_at !== expectedGeneratedAt) {
        throw new Error(
          `Public catalogue ${publicMeta.generated_at || "unknown"} does not match local ${expectedGeneratedAt}.`,
        );
      }

      const password = await readTargetPassword(target);
      for (const file of compressedPublicationFiles) {
        await publishDataFile(file.filePath, file.remoteName, target, password);
      }
      await verifyCompressedDataDelivery(target, expectedGeneratedAt);
    } catch (error) {
      if (target.required) throw error;
      console.error(`Optional compression mirror ${target.name} failed: ${error.message}`);
    }
  }
}

async function refreshCatalog() {
  reportedImageIds = await fetchReportedImageIds();
  const previousSnapshotPath = await preparePreviousSnapshot();
  if (remoteRefreshHosts.length) {
    await buildSnapshotOnRemoteHosts(remoteRefreshHosts, previousSnapshotPath);
  } else {
    await runNodeScript("scripts/build-catalog-snapshot.mjs", {
      POSOKANEI_SNAPSHOT_OUT: snapshotPath,
      POSOKANEI_META_OUT: metaPath,
      POSOKANEI_RUNTIME_OUT: runtimePath,
      POSOKANEI_BOOTSTRAP_OUT: bootstrapPath,
      POSOKANEI_PRICE_CHANGES_OUT: priceChangesPath,
      POSOKANEI_PRICE_CHANGES_JSON_OUT: priceChangesJsonPath,
      POSOKANEI_PRICE_CHANGES_PREVIEW_OUT: priceChangesPreviewPath,
      ...(previousSnapshotPath
        ? { POSOKANEI_PREVIOUS_SNAPSHOT: previousSnapshotPath }
        : {}),
    });
  }

  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  const productCount = Array.isArray(snapshot.products) ? snapshot.products.length : 0;
  if (productCount < minimumProducts) {
    throw new Error(
      `Snapshot guard failed: expected at least ${minimumProducts} products, got ${productCount}.`,
    );
  }

  console.log(
    `Snapshot ready: ${productCount.toLocaleString("en-US")} products generated_at=${snapshot.generated_at}`,
  );
  const productDetails = await writeProductDetailsJsonl(snapshot, productDetailsPath);
  detailVerificationProductId = productDetails.verificationProductId;
  console.log(
    `Wrote ${productDetails.count.toLocaleString("en-US")} product-detail records `
    + `(${productDetails.bytes.toLocaleString("en-US")} bytes).`,
  );
  try {
    await runNodeScript("scripts/generate-daily-bargain.mjs", {
      POSOKANEI_BARGAIN_CATALOG: snapshotPath,
      POSOKANEI_BARGAIN_OUT: dailyBargainPath,
    });
  } catch (error) {
    console.error(`Daily bargain generation failed; keeping the previous pick: ${error.message}`);
  }

  compressedPublicationFiles = await writeCatalogueCompressionVariants();

  await writeRefreshStatus({
    status: "ok",
    checked_at: new Date().toISOString(),
    generated_at: snapshot.generated_at,
    product_count: productCount,
  });

  if (uploadEnabled) {
    for (const target of ftpTargets) {
      try {
        await publishRefreshToTarget(target, snapshot.generated_at);
      } catch (error) {
        if (target.required) throw error;
        console.error(`Optional catalogue mirror ${target.name} failed: ${describeRefreshError(error)}`);
      }
    }
  } else {
    console.log("Upload skipped because --no-upload was passed.");
  }
}

async function buildSnapshotOnRemoteHosts(hosts, previousSnapshotPath) {
  let lastError;

  for (const host of hosts) {
    try {
      console.log(`Building catalogue snapshot on ${host}...`);
      await buildSnapshotOnRemoteHost(host, previousSnapshotPath);
      console.log(`Catalogue snapshot built on ${host}.`);
      return;
    } catch (error) {
      lastError = error;
      console.error(`Refresh runner ${host} failed: ${describeRefreshError(error)}`);
    }
  }

  throw lastError || new Error("All refresh runners failed.");
}

async function buildSnapshotOnRemoteHost(host, previousSnapshotPath) {
  const remoteDir = `/tmp/posokanei-basket-refresh-${Date.now()}`;
  const remoteScriptsDir = `${remoteDir}/scripts`;
  const remoteSrcDir = `${remoteDir}/src`;
  const remoteScript = `${remoteScriptsDir}/build-catalog-snapshot.mjs`;
  const remoteCoverageModule = `${remoteScriptsDir}/catalog-snapshot-coverage.mjs`;
  const remoteRuntimeModule = `${remoteScriptsDir}/catalog-runtime.mjs`;
  const remoteBootstrapModule = `${remoteScriptsDir}/catalog-bootstrap.mjs`;
  const remotePriceExportModule = `${remoteScriptsDir}/price-change-export.mjs`;
  const remotePriceHistoryModule = `${remoteScriptsDir}/price-change-history.mjs`;
  const remoteImageFallbackScript = `${remoteScriptsDir}/catalog-image-fallbacks.mjs`;
  const remoteDemoBasket = `${remoteSrcDir}/demoBasket.js`;
  const remotePackage = `${remoteDir}/package.json`;
  const remoteSnapshot = `${remoteDir}/catalog.json`;
  const remoteMeta = `${remoteDir}/catalog-meta.json`;
  const remoteRuntime = `${remoteDir}/catalog-runtime.json`;
  const remoteBootstrap = `${remoteDir}/catalog-bootstrap.json`;
  const remotePriceChanges = `${remoteDir}/price-changes.csv`;
  const remotePriceChangesJson = `${remoteDir}/price-changes.json`;
  const remotePriceChangesPreview = `${remoteDir}/price-changes-preview.json`;
  const remotePreviousSnapshot = `${remoteDir}/catalog-previous.json`;
  const remoteImageFallbackDir = `${remoteDir}/image-fallbacks`;
  const remoteImageFallbackSummary = `${remoteDir}/image-fallback-summary.json`;
  const sshOptions = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15"];

  await mkdir(dirname(snapshotPath), { recursive: true });
  await mkdir(dirname(metaPath), { recursive: true });
  await mkdir(dirname(runtimePath), { recursive: true });
  await mkdir(dirname(bootstrapPath), { recursive: true });
  await mkdir(dirname(priceChangesPath), { recursive: true });
  await mkdir(dirname(priceChangesJsonPath), { recursive: true });
  await mkdir(dirname(priceChangesPreviewPath), { recursive: true });

  try {
    await run("ssh", [
      ...sshOptions,
      host,
      `rm -rf ${shellQuote(remoteDir)} && mkdir -p ${shellQuote(remoteScriptsDir)} ${shellQuote(remoteSrcDir)}`,
    ]);
    await run("scp", [
      ...sshOptions,
      resolve(projectRoot, "scripts/build-catalog-snapshot.mjs"),
      `${host}:${remoteScript}`,
    ]);
    await run("scp", [
      ...sshOptions,
      resolve(projectRoot, "scripts/catalog-snapshot-coverage.mjs"),
      `${host}:${remoteCoverageModule}`,
    ]);
    await run("scp", [
      ...sshOptions,
      resolve(projectRoot, "scripts/catalog-runtime.mjs"),
      `${host}:${remoteRuntimeModule}`,
    ]);
    await run("scp", [
      ...sshOptions,
      resolve(projectRoot, "scripts/catalog-bootstrap.mjs"),
      `${host}:${remoteBootstrapModule}`,
    ]);
    await run("scp", [
      ...sshOptions,
      resolve(projectRoot, "scripts/price-change-export.mjs"),
      `${host}:${remotePriceExportModule}`,
    ]);
    await run("scp", [
      ...sshOptions,
      resolve(projectRoot, "scripts/price-change-history.mjs"),
      `${host}:${remotePriceHistoryModule}`,
    ]);
    await run("scp", [
      ...sshOptions,
      resolve(projectRoot, "scripts/catalog-image-fallbacks.mjs"),
      `${host}:${remoteImageFallbackScript}`,
    ]);
    await run("scp", [
      ...sshOptions,
      resolve(projectRoot, "src/demoBasket.js"),
      `${host}:${remoteDemoBasket}`,
    ]);
    await run("scp", [
      ...sshOptions,
      resolve(projectRoot, "package.json"),
      `${host}:${remotePackage}`,
    ]);
    if (previousSnapshotPath) {
      await run("scp", [
        ...sshOptions,
        previousSnapshotPath,
        `${host}:${remotePreviousSnapshot}`,
      ]);
    }
    await run("ssh", [
      ...sshOptions,
      host,
      [
        `POSOKANEI_SNAPSHOT_OUT=${shellQuote(remoteSnapshot)}`,
        `POSOKANEI_META_OUT=${shellQuote(remoteMeta)}`,
        `POSOKANEI_RUNTIME_OUT=${shellQuote(remoteRuntime)}`,
        `POSOKANEI_BOOTSTRAP_OUT=${shellQuote(remoteBootstrap)}`,
        `POSOKANEI_PRICE_CHANGES_OUT=${shellQuote(remotePriceChanges)}`,
        `POSOKANEI_PRICE_CHANGES_JSON_OUT=${shellQuote(remotePriceChangesJson)}`,
        `POSOKANEI_PRICE_CHANGES_PREVIEW_OUT=${shellQuote(remotePriceChangesPreview)}`,
        ...(previousSnapshotPath
          ? [`POSOKANEI_PREVIOUS_SNAPSHOT=${shellQuote(remotePreviousSnapshot)}`]
          : []),
        `node ${shellQuote(remoteScript)}`,
      ].join(" "),
    ]);
    try {
      const imageFallbackState = await readImageFallbackState();
      await run("ssh", [
        ...sshOptions,
        host,
        [
          `POSOKANEI_IMAGE_SNAPSHOT=${shellQuote(remoteSnapshot)}`,
          `POSOKANEI_IMAGE_PREVIEW=${shellQuote(remotePriceChangesPreview)}`,
          `POSOKANEI_IMAGE_CHANGES=${shellQuote(remotePriceChangesJson)}`,
          `POSOKANEI_IMAGE_BOOTSTRAP=${shellQuote(remoteBootstrap)}`,
          `POSOKANEI_IMAGE_FALLBACK_OUT=${shellQuote(remoteImageFallbackDir)}`,
          `POSOKANEI_IMAGE_FALLBACK_SUMMARY=${shellQuote(remoteImageFallbackSummary)}`,
          `POSOKANEI_IMAGE_PROXY_URLS=${shellQuote(imageProxyUrlsForTargets().join(","))}`,
          `POSOKANEI_IMAGE_FALLBACK_CURSOR=${shellQuote(String(imageFallbackState.catalogCursor))}`,
          `POSOKANEI_IMAGE_RECENT_CURSOR=${shellQuote(String(imageFallbackState.recentCursor))}`,
          ...optionalRemoteImageEnvironment(),
          `node ${shellQuote(remoteImageFallbackScript)}`,
        ].join(" "),
      ]);
      await mkdir(dirname(imageFallbackSummaryPath), { recursive: true });
      await run("scp", [
        ...sshOptions,
        `${host}:${remoteImageFallbackSummary}`,
        imageFallbackSummaryPath,
      ]);
      const imageSummary = JSON.parse(await readFile(imageFallbackSummaryPath, "utf8"));
      await rm(imageFallbackOutputDir, { recursive: true, force: true });
      await run("scp", [
        ...sshOptions,
        "-r",
        `${host}:${remoteImageFallbackDir}`,
        imageFallbackOutputDir,
      ]);
      imageFallbackPublicationFiles = normalizeImageFallbackFiles(
        imageSummary.files,
        imageFallbackOutputDir,
      );
      imageFallbackPublicationFiles = await optimizeLargeImageFallbacks(
        imageFallbackPublicationFiles,
      );
      await writeImageFallbackState({
        catalogCursor: imageSummary.next_cursor,
        recentCursor: imageSummary.next_recent_cursor,
      });
      console.log(
        `Prepared ${imageFallbackPublicationFiles.length} new official image fallback(s); `
        + `${Number(imageSummary.available || 0)} candidates were already available.`,
      );
    } catch (error) {
      imageFallbackPublicationFiles = [];
      console.error(`Image fallback scan skipped: ${describeRefreshError(error)}`);
    }
    await run("scp", [...sshOptions, `${host}:${remoteSnapshot}`, snapshotPath]);
    await run("scp", [...sshOptions, `${host}:${remoteMeta}`, metaPath]);
    await run("scp", [...sshOptions, `${host}:${remoteRuntime}`, runtimePath]);
    await run("scp", [...sshOptions, `${host}:${remoteBootstrap}`, bootstrapPath]);
    await run("scp", [...sshOptions, `${host}:${remotePriceChanges}`, priceChangesPath]);
    await run("scp", [...sshOptions, `${host}:${remotePriceChangesJson}`, priceChangesJsonPath]);
    await run("scp", [
      ...sshOptions,
      `${host}:${remotePriceChangesPreview}`,
      priceChangesPreviewPath,
    ]);
  } finally {
    await run("ssh", [...sshOptions, host, `rm -rf ${shellQuote(remoteDir)}`], {
      allowFailure: true,
      quiet: true,
    });
  }
}

async function preparePreviousSnapshot() {
  await mkdir(dirname(previousSnapshotCachePath), { recursive: true });
  if (configuredPreviousSnapshotPath) {
    const configuredCandidate = await readSnapshotCandidate(configuredPreviousSnapshotPath);
    if (!configuredCandidate) {
      throw new Error(
        `Configured previous catalogue is invalid: ${configuredPreviousSnapshotPath}`,
      );
    }
    await writeFile(previousSnapshotCachePath, configuredCandidate.raw, "utf8");
    console.log(
      `Using configured catalogue ${configuredCandidate.snapshot.generated_at} for price comparison.`,
    );
    return previousSnapshotCachePath;
  }

  try {
    const response = await fetch(`${publicCatalogUrl}?v=${Date.now()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(90000),
    });
    if (!response.ok) throw new Error(`catalogue returned HTTP ${response.status}`);
    const raw = await response.text();
    const snapshot = parseSnapshotCandidate(raw);
    await writeFile(previousSnapshotCachePath, raw, "utf8");
    console.log(`Downloaded public catalogue ${snapshot.generated_at} for price comparison.`);
    return previousSnapshotCachePath;
  } catch (error) {
    throw new Error(
      `Could not verify the previous public catalogue; refresh stopped before publication: ${error.message}`,
    );
  }
}

async function readSnapshotCandidate(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return { raw, snapshot: parseSnapshotCandidate(raw) };
  } catch {
    return null;
  }
}

function parseSnapshotCandidate(raw) {
  const snapshot = JSON.parse(raw);
  const productCount = Array.isArray(snapshot?.products) ? snapshot.products.length : 0;
  if (productCount < minimumProducts) {
    throw new Error(`previous catalogue contains only ${productCount} products`);
  }
  return snapshot;
}

async function recordRefreshFailure(error) {
  const previous = await readPreviousSnapshotSummary();
  const status = {
    status: "failed",
    checked_at: new Date().toISOString(),
    generated_at: previous.generated_at || "",
    product_count: previous.product_count || 0,
    error: describeRefreshError(error),
  };
  await writeRefreshStatus(status);

  if (!uploadEnabled) return;

  try {
    const password = await readTargetPassword(primaryTarget);
    await publishDataFile(refreshStatusPath, "refresh-status.json", primaryTarget, password);
  } catch (uploadError) {
    console.error(`Could not upload refresh failure status: ${describeRefreshError(uploadError)}`);
  }
}

async function readPreviousSnapshotSummary() {
  try {
    const response = await fetch(`${publicMetaUrl}?v=${Date.now()}`, {
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      const meta = await response.json();
      return snapshotSummaryFromMeta(meta);
    }
  } catch {
    // Fall through to local files when the public metadata is unavailable.
  }

  try {
    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    return snapshotSummaryFromMeta(meta);
  } catch {
    // Fall through to the full snapshot when metadata is unavailable.
  }

  try {
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
    return {
      generated_at: snapshot.generated_at || "",
      product_count: Array.isArray(snapshot.products) ? snapshot.products.length : 0,
    };
  } catch {
    return {};
  }
}

function snapshotSummaryFromMeta(meta) {
  return {
    generated_at: meta?.generated_at || "",
    product_count: Number(meta?.stats?.active_products || meta?.stats?.total_products || 0) || 0,
  };
}

async function writeRefreshStatus(status) {
  await mkdir(dirname(refreshStatusPath), { recursive: true });
  await writeFile(refreshStatusPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
}

async function writeCatalogueCompressionVariants() {
  const sources = [
    { filePath: snapshotPath, remoteName: "catalog.json" },
    { filePath: metaPath, remoteName: "catalog-meta.json" },
    { filePath: runtimePath, remoteName: "catalog-runtime.json" },
    { filePath: bootstrapPath, remoteName: "catalog-bootstrap.json" },
    { filePath: priceChangesPath, remoteName: "price-changes.csv" },
    { filePath: priceChangesJsonPath, remoteName: "price-changes.json" },
    { filePath: priceChangesPreviewPath, remoteName: "price-changes-preview.json" },
    ...(existsSync(dailyBargainPath)
      ? [{ filePath: dailyBargainPath, remoteName: "daily-bargain.json" }]
      : []),
  ];
  const publicationFiles = [];

  for (const source of sources) {
    const variants = await writeCompressedVariants(source.filePath, {
      ...(source.remoteName === "price-changes.json"
        ? { gzipPath: priceChangesGzipPath }
        : {}),
    });
    variants.forEach((variant) => {
      publicationFiles.push({
        ...variant,
        remoteName: `${source.remoteName}.${variant.encoding === "gzip" ? "gz" : "br"}`,
      });
    });
  }

  const rawBytes = new Map();
  publicationFiles.forEach((file) => {
    rawBytes.set(file.remoteName.replace(/\.(?:br|gz)$/u, ""), file.sourceBytes);
  });
  const sourceTotal = [...rawBytes.values()].reduce((sum, value) => sum + value, 0);
  const brotliTotal = publicationFiles
    .filter((file) => file.encoding === "br")
    .reduce((sum, file) => sum + file.bytes, 0);
  const gzipTotal = publicationFiles
    .filter((file) => file.encoding === "gzip")
    .reduce((sum, file) => sum + file.bytes, 0);
  console.log(
    `Wrote ${publicationFiles.length.toLocaleString("en-US")} compressed catalogue files `
    + `(raw ${formatBytes(sourceTotal)}, Brotli ${formatBytes(brotliTotal)}, gzip ${formatBytes(gzipTotal)}).`,
  );
  return publicationFiles;
}

function formatBytes(value) {
  return `${(value / 1024 / 1024).toFixed(2)} MiB`;
}

function describeRefreshError(error) {
  const message = String(error?.message || error || "Catalogue refresh failed.");
  const httpMatch = message.match(/returned HTTP (\d+)/);
  const endpointMatch = message.match(/Error: (\/[^\\s]+) returned HTTP \d+/);
  if (httpMatch && endpointMatch) {
    return `${endpointMatch[1]} returned HTTP ${httpMatch[1]}`;
  }
  if (httpMatch) {
    return `Upstream returned HTTP ${httpMatch[1]}`;
  }
  if (/Connection timed out during banner exchange|UNKNOWN port 65535|ssh exited with 255/i.test(message)) {
    return "Refresh runner SSH connection timed out.";
  }
  if (/UND_ERR_CONNECT_TIMEOUT|Connect Timeout Error/i.test(message)) {
    return "Refresh runner could not connect to the upstream API.";
  }
  if (/curl exited with 28|FTP response timeout|operation timed out/i.test(message)) {
    return "Catalogue publication timed out.";
  }
  if (/fetch failed/i.test(message)) {
    return "Refresh runner fetch failed.";
  }
  return "Catalogue refresh failed.";
}

function loadLocalEnv(envPath) {
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue
      .replace(/^['"]|['"]$/g, "")
      .replace(/\\n/g, "\n");
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set in the environment or .env.local.`);
  }
  return value;
}

function parseRefreshHosts(value) {
  return String(value || "")
    .split(/[,\s]+/)
    .map((host) => host.trim())
    .filter(Boolean);
}

async function runNodeScript(script, extraEnv = {}) {
  await run(process.execPath, [resolve(projectRoot, script)], {
    cwd: projectRoot,
    env: { ...process.env, ...extraEnv },
  });
}

async function readTargetPassword(target) {
  const directPassword = target.password || "";
  if (directPassword) return directPassword;
  if (!target.keychainService) {
    throw new Error("FTP_PASS or FTP_KEYCHAIN_SERVICE must be set in the environment or .env.local.");
  }
  const { stdout } = await run("/usr/bin/security", [
    "find-generic-password",
    "-s",
    target.keychainService,
    "-a",
    target.user,
    "-w",
  ], { quiet: true });
  const password = stdout.trim();
  if (!password) {
    throw new Error("The FTP password was not found in Keychain and FTP_PASS was not set.");
  }
  return password;
}

async function publishRefreshToTarget(target, expectedGeneratedAt) {
  const password = await readTargetPassword(target);
  await publishImageFallbackFiles(target, password);
  await publishDataFile(snapshotPath, "catalog.json", target, password);
  await publishDataFile(metaPath, "catalog-meta.json", target, password);
  await publishDataFile(runtimePath, "catalog-runtime.json", target, password);
  await publishDataFile(bootstrapPath, "catalog-bootstrap.json", target, password);
  await publishDataFile(priceChangesPath, "price-changes.csv", target, password);
  await publishDataFile(priceChangesJsonPath, "price-changes.json", target, password);
  await publishDataFile(priceChangesPreviewPath, "price-changes-preview.json", target, password);
  await publishDataFile(productDetailsPath, "catalog-details.jsonl", target, password);
  if (existsSync(dailyBargainPath)) {
    await publishDataFile(dailyBargainPath, "daily-bargain.json", target, password);
  }
  for (const file of compressedPublicationFiles) {
    await publishDataFile(file.filePath, file.remoteName, target, password);
  }
  // Publish status last so it only announces a refresh after every data file is live.
  await publishDataFile(refreshStatusPath, "refresh-status.json", target, password);
  await verifyPublicRefreshFiles(expectedGeneratedAt, target);
  await verifyCompressedDataDelivery(target, expectedGeneratedAt);
}

async function publishImageFallbackFiles(target, password, { strict = false } = {}) {
  let published = 0;
  const failures = [];
  let nextIndex = 0;
  const requestedConcurrency = Number(
    process.env.POSOKANEI_IMAGE_UPLOAD_CONCURRENCY || 1,
  );
  const workerCount = Math.max(
    1,
    Math.min(
      Number.isInteger(requestedConcurrency) ? requestedConcurrency : 1,
      imageFallbackPublicationFiles.length,
    ),
  );

  async function worker() {
    while (nextIndex < imageFallbackPublicationFiles.length) {
      const file = imageFallbackPublicationFiles[nextIndex];
      nextIndex += 1;
      try {
        await publishDataFile(
          file.filePath,
          `image-fallbacks/${file.fileName}`,
          target,
          password,
        );
        await verifyPublishedImageFallback(file, target);
        if (strict) await verifyImageProxyFallback(file, target);
        published += 1;
      } catch (error) {
        failures.push({ file, error });
        console.error(
          `Image fallback ${file.id} was not published to ${target.name}: `
          + `${describeRefreshError(error)}`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (published) {
    console.log(`Verified ${published} new image fallback(s) on ${target.name}.`);
  }
  if (strict && failures.length) {
    throw new Error(
      `${failures.length} of ${imageFallbackPublicationFiles.length} image fallbacks failed on ${target.name}.`,
    );
  }
  return { published, failed: failures.length };
}

async function verifyPublishedImageFallback(file, target) {
  const url = publicDataUrl(target, `image-fallbacks/${file.fileName}`);
  const response = await fetch(cacheBustUrl(url), {
    headers: { Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok || !String(response.headers.get("content-type") || "").startsWith("image/")) {
    throw new Error(`${url} verification returned HTTP ${response.status}.`);
  }
  const bytes = (await response.arrayBuffer()).byteLength;
  if (bytes < 100) throw new Error(`${url} verification returned an empty image.`);
}

async function verifyImageProxyFallback(file, target) {
  const url = new URL(imageProxyUrlForTarget(target));
  url.searchParams.set("resource", "image");
  url.searchParams.set("id", file.id);
  url.searchParams.set("size", "96");
  if (file.version) url.searchParams.set("v", file.version);
  url.searchParams.set("check", String(Date.now()));
  const response = await fetch(url, {
    headers: { Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" },
    signal: AbortSignal.timeout(60000),
  });
  const source = String(response.headers.get("x-posokanei-image-source") || "");
  if (
    !response.ok
    || !String(response.headers.get("content-type") || "").startsWith("image/")
    || !["local-fallback", "local-image-cache"].includes(source)
  ) {
    throw new Error(`${url} proxy verification returned HTTP ${response.status} from ${source || "unknown"}.`);
  }
  const bytes = (await response.arrayBuffer()).byteLength;
  if (bytes < 100) throw new Error(`${url} proxy verification returned an empty image.`);
}

async function publishDataFile(filePath, remoteName, target, password) {
  const remoteRoot = target.remoteDir === "." ? "" : `${target.remoteDir}/`;
  await uploadFileAtomic({
    filePath,
    url: `ftp://${target.host}/${remoteRoot}data/${remoteName}`,
    user: target.user,
    password,
    cwd: projectRoot,
  });
}

async function fetchPublicJson(url) {
  const response = await fetch(cacheBustUrl(url), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    throw new Error(`${url} verification returned HTTP ${response.status}.`);
  }
  return response.json();
}

async function fetchPublicText(url) {
  const response = await fetch(cacheBustUrl(url), {
    headers: { Accept: "text/csv" },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    throw new Error(`${url} verification returned HTTP ${response.status}.`);
  }
  return response.text();
}

function cacheBustUrl(value) {
  const url = new URL(value);
  url.searchParams.set("v", String(Date.now()));
  return url.toString();
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

async function verifyPublicRefreshFiles(expectedGeneratedAt, target) {
  const targetCatalogUrl = target.publicCatalogUrl || publicDataUrl(target, "catalog.json");
  const targetMetaUrl = targetCatalogUrl.replace(/catalog\.json$/, "catalog-meta.json");
  const targetRuntimeUrl = targetCatalogUrl.replace(/catalog\.json$/, "catalog-runtime.json");
  const targetBootstrapUrl = targetCatalogUrl.replace(/catalog\.json$/, "catalog-bootstrap.json");
  const targetPriceChangesUrl = targetCatalogUrl.replace(/catalog\.json$/, "price-changes.csv");
  const targetPriceChangesJsonUrl = targetCatalogUrl.replace(/catalog\.json$/, "price-changes.json");
  const targetPriceChangesPreviewUrl = targetCatalogUrl.replace(
    /catalog\.json$/,
    "price-changes-preview.json",
  );
  const targetPriceChangesApiUrl = targetCatalogUrl.replace(
    /\/data\/catalog\.json$/,
    "/api/price-changes.php",
  );
  const targetStatusUrl = targetCatalogUrl.replace(/catalog\.json$/, "refresh-status.json");
  const targetBargainUrl = targetCatalogUrl.replace(/catalog\.json$/, "daily-bargain.json");
  const targetProductDetailsUrl = targetCatalogUrl.replace(
    /\/data\/catalog\.json$/,
    `/api/posokanei.php?resource=products-by-ids&details=1&ids=${encodeURIComponent(detailVerificationProductId)}`,
  );
  let observed = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const [
        publicSnapshot,
        publicMeta,
        publicRuntime,
        publicBootstrap,
        publicPriceChanges,
        publicPriceChangesJson,
        publicPriceChangesPreview,
        publicPriceChangesApi,
        publicProductDetails,
        publicRefreshStatus,
      ] = await Promise.all([
        fetchPublicJson(targetCatalogUrl),
        fetchPublicJson(targetMetaUrl),
        fetchPublicJson(targetRuntimeUrl),
        fetchPublicJson(targetBootstrapUrl),
        fetchPublicText(targetPriceChangesUrl),
        fetchPublicJson(targetPriceChangesJsonUrl),
        fetchPublicJson(targetPriceChangesPreviewUrl),
        fetchPublicJson(targetPriceChangesApiUrl),
        fetchPublicJson(targetProductDetailsUrl),
        fetchPublicJson(targetStatusUrl),
      ]);
      const priceChanges = inspectPriceChangesCsv(publicPriceChanges);
      const priceChangesJson = inspectPriceChangesJson(publicPriceChangesJson);
      const priceChangesPreview = inspectPriceChangesJson(publicPriceChangesPreview);
      const priceChangesApi = inspectPriceChangesJson(publicPriceChangesApi);
      const detailProduct = Array.isArray(publicProductDetails?.products)
        ? publicProductDetails.products[0]
        : null;
      const activePriceChanges = Number(
        publicMeta?.price_change_stats?.active_offers
          ?? publicSnapshot?.price_change_stats?.active_offers
          ?? 0,
      );
      observed = {
        snapshot: publicSnapshot.generated_at || "",
        metadata: publicMeta.generated_at || "",
        runtime: publicRuntime.generated_at || "",
        bootstrap: publicBootstrap.generated_at || "",
        priceChanges: priceChanges.generatedAt || "",
        priceChangeRows: priceChanges.rowCount,
        priceChangesJson: priceChangesJson.generatedAt || "",
        priceChangeJsonRows: priceChangesJson.rowCount,
        priceChangesPreview: priceChangesPreview.generatedAt || "",
        priceChangePreviewRows: priceChangesPreview.rowCount,
        priceChangesApi: priceChangesApi.generatedAt || "",
        priceChangeApiRows: priceChangesApi.rowCount,
        detailProductId: String(detailProduct?.id || ""),
        detailGeneratedAt: String(publicProductDetails?.snapshot_generated_at || ""),
        activePriceChanges,
        status: publicRefreshStatus.generated_at || "",
        statusValue: publicRefreshStatus.status || "",
      };
      const timestamps = [
        observed.snapshot,
        observed.metadata,
        observed.runtime,
        observed.bootstrap,
        observed.status,
      ];
      const publishedAt = Date.parse(observed.snapshot);
      const expectedAt = Date.parse(expectedGeneratedAt);
      if (
        timestamps.every((value) => value === observed.snapshot) &&
        observed.statusValue === "ok" &&
        Number.isFinite(publishedAt) &&
        publishedAt >= expectedAt &&
        priceChanges.rowCount === activePriceChanges &&
        priceChangesJson.rowCount === activePriceChanges &&
        (priceChanges.rowCount === 0 || priceChanges.generatedAt === observed.snapshot) &&
        priceChangesJson.generatedAt === observed.snapshot &&
        observed.priceChangesPreview === observed.snapshot &&
        observed.priceChangePreviewRows === Math.min(
          PRICE_CHANGES_PREVIEW_LIMIT,
          activePriceChanges,
        ) &&
        priceChangesApi.rowCount === activePriceChanges &&
        priceChangesApi.generatedAt === observed.snapshot &&
        observed.detailProductId === detailVerificationProductId &&
        observed.detailGeneratedAt === observed.snapshot
      ) {
        if (observed.snapshot !== expectedGeneratedAt) {
          console.log(`Accepted newer concurrent catalogue ${observed.snapshot}.`);
        }
        break;
      }
    } catch (error) {
      observed = { error: error.message };
    }

    if (attempt === 5) {
      throw new Error(
        `Public catalogue verification did not converge for ${expectedGeneratedAt}: ${JSON.stringify(observed)}.`,
      );
    }
    await sleep(5000);
  }

  console.log(`Verified public catalogue at ${targetCatalogUrl}`);
  console.log(`Verified public metadata at ${targetMetaUrl}`);
  console.log(`Verified compact runtime catalogue at ${targetRuntimeUrl}`);
  console.log(`Verified static startup catalogue at ${targetBootstrapUrl}`);
  console.log(`Verified price-change CSV at ${targetPriceChangesUrl}`);
  console.log(`Verified price-change display data at ${targetPriceChangesJsonUrl}`);
  console.log(`Verified initial price-change preview at ${targetPriceChangesPreviewUrl}`);
  console.log(`Verified compressed price-change API at ${targetPriceChangesApiUrl}`);
  console.log(`Verified product-detail sidecar through ${targetProductDetailsUrl}`);
  console.log(`Verified public refresh status at ${targetStatusUrl}`);
  if (existsSync(dailyBargainPath)) {
    const localDailyBargain = JSON.parse(await readFile(dailyBargainPath, "utf8"));
    const publicDailyBargain = await fetchPublicJson(targetBargainUrl);
    if (publicDailyBargain.generated_at !== localDailyBargain.generated_at) {
      throw new Error("Public daily-bargain verification mismatch.");
    }
    console.log(`Verified public daily bargain at ${targetBargainUrl}`);
  }
}

async function verifyCompressedDataDelivery(target, expectedGeneratedAt) {
  const targetCatalogUrl = target.publicCatalogUrl || publicDataUrl(target, "catalog.json");
  const targetRuntimeUrl = targetCatalogUrl.replace(/catalog\.json$/u, "catalog-runtime.json");
  const targetBootstrapUrl = targetCatalogUrl.replace(/catalog\.json$/u, "catalog-bootstrap.json");
  const targetPriceChangesPreviewUrl = targetCatalogUrl.replace(
    /catalog\.json$/u,
    "price-changes-preview.json",
  );

  for (const encoding of ["br", "gzip"]) {
    for (const url of [targetRuntimeUrl, targetBootstrapUrl, targetPriceChangesPreviewUrl]) {
      const response = await fetch(cacheBustUrl(url), {
        method: "HEAD",
        headers: { "Accept-Encoding": encoding },
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok || response.headers.get("content-encoding") !== encoding) {
        throw new Error(`${url} did not negotiate ${encoding} compression.`);
      }
    }
  }

  const bootstrapResponse = await fetch(cacheBustUrl(targetBootstrapUrl), {
    headers: { Accept: "application/json", "Accept-Encoding": "br" },
    signal: AbortSignal.timeout(60000),
  });
  const bootstrap = await bootstrapResponse.json();
  if (bootstrap.generated_at !== expectedGeneratedAt) {
    throw new Error("Compressed bootstrap verification returned a different catalogue.");
  }
  console.log(`Verified Brotli and gzip catalogue delivery at ${targetRuntimeUrl}`);
}

function buildFtpTargets() {
  const primary = {
    name: "primary",
    required: true,
    host: requiredEnv("FTP_HOST"),
    remoteDir: trimSlashes(requiredEnv("FTP_REMOTE_DIR")) || ".",
    user: requiredEnv("FTP_USER"),
    password: process.env.FTP_PASS || "",
    keychainService: process.env.FTP_KEYCHAIN_SERVICE || "",
    publicCatalogUrl: process.env.POSOKANEI_PUBLIC_CATALOG_URL || "",
  };
  if (!process.env.FTP_MIRROR_HOST) return [primary];
  return [
    primary,
    {
      name: "legacy",
      required: false,
      host: requiredEnv("FTP_MIRROR_HOST"),
      remoteDir: trimSlashes(requiredEnv("FTP_MIRROR_REMOTE_DIR")) || ".",
      user: requiredEnv("FTP_MIRROR_USER"),
      password: process.env.FTP_MIRROR_PASS || "",
      keychainService: process.env.FTP_MIRROR_KEYCHAIN_SERVICE || "",
      publicCatalogUrl: process.env.POSOKANEI_MIRROR_PUBLIC_CATALOG_URL || "",
    },
  ];
}

function publicDataUrl(target, fileName) {
  if (target.publicCatalogUrl) {
    return target.publicCatalogUrl.replace(/catalog\.json$/, fileName);
  }
  const remoteRoot = target.remoteDir === "." ? "" : `${target.remoteDir}/`;
  return `https://${target.host}/${remoteRoot}data/${fileName}`;
}

function imageProxyUrlsForTargets() {
  return ftpTargets.map(imageProxyUrlForTarget);
}

function imageProxyUrlForTarget(target) {
  const catalogUrl = target.publicCatalogUrl || publicDataUrl(target, "catalog.json");
  return catalogUrl.replace(/\/data\/catalog\.json$/u, "/api/posokanei.php");
}

async function readImageFallbackState() {
  try {
    const state = JSON.parse(await readFile(imageFallbackStatePath, "utf8"));
    return {
      catalogCursor: Math.max(
        0,
        Number(state?.catalog_cursor ?? state?.cursor) || 0,
      ),
      recentCursor: Math.max(0, Number(state?.recent_changes_cursor) || 0),
    };
  } catch {
    return { catalogCursor: 0, recentCursor: 0 };
  }
}

async function writeImageFallbackState({ catalogCursor, recentCursor }) {
  await mkdir(dirname(imageFallbackStatePath), { recursive: true });
  await writeFile(
    imageFallbackStatePath,
    `${JSON.stringify({
      catalog_cursor: Math.max(0, Number(catalogCursor) || 0),
      recent_changes_cursor: Math.max(0, Number(recentCursor) || 0),
      updated_at: new Date().toISOString(),
    }, null, 2)}\n`,
    "utf8",
  );
}

function optionalRemoteImageEnvironment() {
  const configuredForcedIds = String(process.env.POSOKANEI_IMAGE_FORCE_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const forcedIds = collectReportedImageIds([], [
    ...configuredForcedIds,
    ...reportedImageIds,
  ]);
  return [
    ["POSOKANEI_IMAGE_FORCE_IDS", forcedIds.join(",")],
    [
      "POSOKANEI_IMAGE_FALLBACK_ROTATION_LIMIT",
      process.env.POSOKANEI_IMAGE_FALLBACK_ROTATION_LIMIT,
    ],
    [
      "POSOKANEI_IMAGE_RECENT_ROTATION_LIMIT",
      process.env.POSOKANEI_IMAGE_RECENT_ROTATION_LIMIT,
    ],
    [
      "POSOKANEI_IMAGE_FALLBACK_CONCURRENCY",
      process.env.POSOKANEI_IMAGE_FALLBACK_CONCURRENCY,
    ],
    [
      "POSOKANEI_IMAGE_PROXY_CHECK_SIZES",
      process.env.POSOKANEI_IMAGE_PROXY_CHECK_SIZES,
    ],
  ]
    .filter(([, value]) => String(value || "").trim() !== "")
    .map(([name, value]) => `${name}=${shellQuote(String(value))}`);
}

async function fetchReportedImageIds() {
  const payloads = [];
  for (const target of ftpTargets) {
    const url = new URL(imageProxyUrlForTarget(target));
    url.searchParams.set("resource", "image-missing-reports");
    try {
      payloads.push(await fetchPublicJson(url.toString()));
    } catch (error) {
      console.error(
        `Missing-image reports were unavailable on ${target.name}: ${describeRefreshError(error)}`,
      );
    }
  }
  const ids = collectReportedImageIds(payloads);
  if (ids.length) {
    console.log(`Prioritizing ${ids.length} browser-observed missing image(s).`);
  }
  return ids;
}

function normalizeImageFallbackFiles(files, outputDirectory) {
  if (!Array.isArray(files)) return [];
  return files.map((file) => {
    const fileName = String(file?.fileName || "");
    if (
      basename(fileName) !== fileName
      || !/^[a-zA-Z0-9_.-]+\.(?:avif|gif|jpg|png|webp)$/u.test(fileName)
    ) {
      throw new Error("Image fallback summary contains an unsafe file name.");
    }
    return {
      id: String(file?.id || ""),
      version: String(file?.version || ""),
      fileName,
      filePath: resolve(outputDirectory, fileName),
    };
  });
}

async function optimizeLargeImageFallbacks(files) {
  const publishable = [];
  for (const file of files) {
    const sourceStat = await stat(file.filePath);
    if (sourceStat.size <= maximumPublishedImageFallbackBytes) {
      publishable.push(file);
      continue;
    }

    let optimized = false;
    const extension = file.fileName.split(".").at(-1) || "img";
    for (const maximumDimension of [1600, 1280, 960]) {
      const temporaryPath = `${file.filePath}.resized-${process.pid}-${maximumDimension}.${extension}`;
      try {
        await run("sips", [
          "--resampleHeightWidthMax",
          String(maximumDimension),
          file.filePath,
          "--out",
          temporaryPath,
        ], { quiet: true });
        const resizedStat = await stat(temporaryPath);
        if (
          resizedStat.size > 100
          && resizedStat.size <= maximumPublishedImageFallbackBytes
        ) {
          await rename(temporaryPath, file.filePath);
          console.log(
            `Optimized oversized image fallback ${file.id} from ${sourceStat.size} `
            + `to ${resizedStat.size} bytes.`,
          );
          optimized = true;
          break;
        }
      } catch (error) {
        console.error(
          `Could not resize image fallback ${file.id} at ${maximumDimension}px: `
          + describeRefreshError(error),
        );
      } finally {
        await rm(temporaryPath, { force: true });
      }
    }

    if (optimized) publishable.push(file);
    else {
      console.error(
        `Image fallback ${file.id} remains above the publication size limit and was skipped.`,
      );
    }
  }
  return publishable;
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd || projectRoot,
      env: options.env || process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!options.quiet) process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (!options.quiet) process.stderr.write(chunk);
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun({ stdout, stderr });
        return;
      }
      if (options.allowFailure) {
        resolveRun({ stdout, stderr });
        return;
      }
      rejectRun(new Error(`${command} exited with ${code}: ${stderr || stdout}`));
    });
    if (options.input) {
      child.stdin.end(options.input);
    } else {
      child.stdin.end();
    }
  });
}

function trimSlashes(value) {
  return String(value).replace(/^\/+|\/+$/g, "");
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
