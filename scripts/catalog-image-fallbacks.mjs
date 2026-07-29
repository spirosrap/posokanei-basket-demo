#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_HOST = "api.posokanei.gov.gr";
const DEFAULT_ROTATION_LIMIT = 480;
const DEFAULT_RECENT_ROTATION_LIMIT = 600;
const DEFAULT_CONCURRENCY = 8;
const MAX_SOURCE_IMAGE_BYTES = 32 * 1024 * 1024;
const PUBLIC_PROXY_CHECK_SIZES = [96, 960];

export function selectImageFallbackCandidates({
  snapshot,
  preview,
  bootstrap,
  recentChanges,
  forcedIds = [],
  cursor = 0,
  recentCursor = 0,
  rotationLimit = DEFAULT_ROTATION_LIMIT,
  recentRotationLimit = DEFAULT_RECENT_ROTATION_LIMIT,
}) {
  const products = Array.isArray(snapshot?.products) ? snapshot.products : [];
  const eligible = products
    .map(normalizeImageCandidate)
    .filter(Boolean);
  const byId = new Map(eligible.map((product) => [product.id, product]));
  const priorityIds = [
    ...forcedIds,
    ...Object.keys(preview?.products || {}),
    ...(Array.isArray(bootstrap?.products)
      ? bootstrap.products.map((product) => String(product?.id || ""))
      : []),
  ];
  const recentSelection = rotateCandidates({
    ids: Object.keys(recentChanges?.products || {}),
    byId,
    cursor: recentCursor,
    limit: recentRotationLimit,
  });
  const catalogSelection = rotateCandidates({
    ids: eligible.map((product) => product.id),
    byId,
    cursor,
    limit: rotationLimit,
  });

  const candidates = [];
  const seen = new Set();
  for (const id of priorityIds) {
    const product = byId.get(id);
    if (!product || seen.has(product.id)) continue;
    seen.add(product.id);
    candidates.push(product);
  }
  const priorityCount = candidates.length;
  for (const product of recentSelection.products) {
    if (seen.has(product.id)) continue;
    seen.add(product.id);
    candidates.push(product);
  }
  const recentRotationCount = candidates.length - priorityCount;
  for (const product of catalogSelection.products) {
    if (seen.has(product.id)) continue;
    seen.add(product.id);
    candidates.push(product);
  }
  const catalogRotationCount = candidates.length - priorityCount - recentRotationCount;

  return {
    candidates,
    eligibleCount: eligible.length,
    priorityCount,
    recentRotationCount,
    catalogRotationCount,
    rotationCount: recentRotationCount + catalogRotationCount,
    nextRecentCursor: recentSelection.nextCursor,
    nextCursor: catalogSelection.nextCursor,
  };
}

function rotateCandidates({ ids, byId, cursor, limit }) {
  const eligibleIds = ids.filter((id) => byId.has(id));
  if (!eligibleIds.length) return { products: [], nextCursor: 0 };
  const normalizedCursor = Math.max(0, Number(cursor) || 0) % eligibleIds.length;
  const actualRotation = Math.min(
    Math.max(0, Number(limit) || 0),
    eligibleIds.length,
  );
  const products = [];
  for (let index = 0; index < actualRotation; index += 1) {
    products.push(byId.get(eligibleIds[(normalizedCursor + index) % eligibleIds.length]));
  }
  return {
    products,
    nextCursor: (normalizedCursor + actualRotation) % eligibleIds.length,
  };
}

export function normalizeImageCandidate(product) {
  const id = String(product?.id || "");
  if (!/^[a-zA-Z0-9_-]+$/u.test(id)) return null;

  let imageUrl;
  try {
    imageUrl = new URL(String(product?.image_url || ""));
  } catch {
    return null;
  }
  const match = imageUrl.pathname.match(/^\/images\/product\/([^/]+)$/u);
  if (imageUrl.hostname !== API_HOST || !match) return null;
  if (decodeURIComponent(match[1]) !== id) return null;

  const rawVersion = String(
    product?.image_version || imageUrl.searchParams.get("v") || "",
  );
  const version = /^[a-zA-Z0-9._-]+$/u.test(rawVersion) ? rawVersion : "";
  return {
    id,
    version,
    imageUrl: imageUrl.toString(),
  };
}

export function detectImageFormat(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  if (buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    return { extension: "png", contentType: "image/png" };
  }
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { extension: "webp", contentType: "image/webp" };
  }
  const gifHeader = buffer.subarray(0, 6).toString("ascii");
  if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
    return { extension: "gif", contentType: "image/gif" };
  }
  if (
    buffer.subarray(4, 8).toString("ascii") === "ftyp"
    && ["avif", "avis"].includes(buffer.subarray(8, 12).toString("ascii"))
  ) {
    return { extension: "avif", contentType: "image/avif" };
  }
  return null;
}

export function imageFallbackFileName(candidate, format) {
  const suffix = candidate.version ? `-${candidate.version}` : "";
  return `${candidate.id}${suffix}.${format.extension}`;
}

export function officialImageCandidateUrls(candidate) {
  const urls = [candidate.imageUrl];
  if (!candidate.version) return urls;
  try {
    const unversionedUrl = new URL(candidate.imageUrl);
    unversionedUrl.searchParams.delete("v");
    if (unversionedUrl.toString() !== candidate.imageUrl) {
      urls.push(unversionedUrl.toString());
    }
  } catch {
    // The normalized candidate URL is already validated before this point.
  }
  return urls;
}

export async function cacheMissingCatalogImages({
  candidates,
  proxyUrls,
  outputDirectory,
  concurrency = DEFAULT_CONCURRENCY,
  fetcher = fetch,
}) {
  await mkdir(outputDirectory, { recursive: true });
  const files = [];
  const failures = [];
  let available = 0;
  let nextIndex = 0;
  const workerCount = Math.max(
    1,
    Math.min(Number(concurrency) || DEFAULT_CONCURRENCY, candidates.length || 1),
  );

  async function worker() {
    while (nextIndex < candidates.length) {
      const candidate = candidates[nextIndex];
      nextIndex += 1;
      try {
        const delivered = await Promise.all(
          proxyUrls.map((proxyUrl) => publicProxyHasImage(candidate, proxyUrl, fetcher)),
        );
        if (delivered.every(Boolean)) {
          available += 1;
          continue;
        }

        const source = await fetchFirstValidatedImage(officialImageCandidateUrls(candidate), fetcher, {
          "Accept-Language": "el-GR,el;q=0.9,en;q=0.8",
          Origin: "https://posokanei.gov.gr",
          Referer: "https://posokanei.gov.gr/",
        });
        const fileName = imageFallbackFileName(candidate, source.format);
        const filePath = resolve(outputDirectory, fileName);
        await writeFile(filePath, source.buffer);
        files.push({
          id: candidate.id,
          version: candidate.version,
          fileName,
          filePath,
          contentType: source.format.contentType,
          bytes: source.buffer.length,
        });
        console.log(`Cached official image fallback for ${candidate.id} (${source.buffer.length} bytes).`);
      } catch (error) {
        failures.push({ id: candidate.id, error: String(error?.message || error) });
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return { files, failures, available };
}

async function fetchFirstValidatedImage(urls, fetcher, headers) {
  let lastError;
  for (const url of urls) {
    try {
      return await fetchValidatedImage(url, fetcher, headers);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("No official image URL was available.");
}

async function publicProxyHasImage(candidate, proxyBase, fetcher) {
  for (const size of PUBLIC_PROXY_CHECK_SIZES) {
    const url = new URL(proxyBase);
    url.searchParams.set("resource", "image");
    url.searchParams.set("id", candidate.id);
    url.searchParams.set("size", String(size));
    if (candidate.version) url.searchParams.set("v", candidate.version);
    try {
      const response = await fetcher(url, {
        method: "HEAD",
        headers: {
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(20000),
      });
      const contentType = String(response.headers.get("content-type") || "");
      const source = String(response.headers.get("x-posokanei-image-source") || "");
      if (!response.ok || !contentType.startsWith("image/") || source === "unavailable") {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

async function fetchValidatedImage(url, fetcher, headers = {}) {
  const response = await fetcher(url, {
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      ...headers,
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Image returned HTTP ${response.status}.`);
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_SOURCE_IMAGE_BYTES) throw new Error("Image exceeds the source size limit.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 100 || buffer.length > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error("Image response has an invalid size.");
  }
  const format = detectImageFormat(buffer);
  if (!format) throw new Error("Image response has an unsupported format.");
  return { buffer, format };
}

async function main() {
  const snapshotPath = requiredEnv("POSOKANEI_IMAGE_SNAPSHOT");
  const previewPath = requiredEnv("POSOKANEI_IMAGE_PREVIEW");
  const bootstrapPath = requiredEnv("POSOKANEI_IMAGE_BOOTSTRAP");
  const recentChangesPath = process.env.POSOKANEI_IMAGE_CHANGES || "";
  const outputDirectory = requiredEnv("POSOKANEI_IMAGE_FALLBACK_OUT");
  const summaryPath = requiredEnv("POSOKANEI_IMAGE_FALLBACK_SUMMARY");
  const proxyUrls = String(requiredEnv("POSOKANEI_IMAGE_PROXY_URLS"))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const [snapshot, preview, bootstrap, recentChanges] = await Promise.all([
    readJson(snapshotPath),
    readJson(previewPath),
    readJson(bootstrapPath),
    recentChangesPath ? readJson(recentChangesPath) : { products: {} },
  ]);
  const selection = selectImageFallbackCandidates({
    snapshot,
    preview,
    bootstrap,
    recentChanges,
    forcedIds: String(process.env.POSOKANEI_IMAGE_FORCE_IDS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    cursor: Number(process.env.POSOKANEI_IMAGE_FALLBACK_CURSOR || 0),
    recentCursor: Number(process.env.POSOKANEI_IMAGE_RECENT_CURSOR || 0),
    rotationLimit: Number(
      process.env.POSOKANEI_IMAGE_FALLBACK_ROTATION_LIMIT || DEFAULT_ROTATION_LIMIT,
    ),
    recentRotationLimit: Number(
      process.env.POSOKANEI_IMAGE_RECENT_ROTATION_LIMIT
      || DEFAULT_RECENT_ROTATION_LIMIT,
    ),
  });
  const result = await cacheMissingCatalogImages({
    candidates: selection.candidates,
    proxyUrls,
    outputDirectory,
    concurrency: Number(
      process.env.POSOKANEI_IMAGE_FALLBACK_CONCURRENCY || DEFAULT_CONCURRENCY,
    ),
  });
  const summary = {
    checked: selection.candidates.length,
    eligible: selection.eligibleCount,
    priority: selection.priorityCount,
    rotation: selection.rotationCount,
    recent_rotation: selection.recentRotationCount,
    catalog_rotation: selection.catalogRotationCount,
    available: result.available,
    cached: result.files.length,
    failed: result.failures.length,
    next_cursor: selection.nextCursor,
    next_recent_cursor: selection.nextRecentCursor,
    files: result.files.map(({ filePath: _filePath, ...file }) => file),
    failures: result.failures,
  };
  await mkdir(dirname(summaryPath), { recursive: true });
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(
    `Image fallback scan: ${summary.checked} checked, ${summary.cached} cached, `
    + `${summary.available} already available, ${summary.failed} unavailable.`,
  );
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set.`);
  return value;
}

const isDirectRun = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) await main();
