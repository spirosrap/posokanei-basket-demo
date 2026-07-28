#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_HOST = "api.posokanei.gov.gr";
const DEFAULT_ROTATION_LIMIT = 80;
const DEFAULT_CONCURRENCY = 8;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export function selectImageFallbackCandidates({
  snapshot,
  preview,
  bootstrap,
  cursor = 0,
  rotationLimit = DEFAULT_ROTATION_LIMIT,
}) {
  const products = Array.isArray(snapshot?.products) ? snapshot.products : [];
  const eligible = products
    .map(normalizeImageCandidate)
    .filter(Boolean);
  const byId = new Map(eligible.map((product) => [product.id, product]));
  const priorityIds = [
    ...Object.keys(preview?.products || {}),
    ...(Array.isArray(bootstrap?.products)
      ? bootstrap.products.map((product) => String(product?.id || ""))
      : []),
  ];
  const normalizedCursor = eligible.length
    ? Math.max(0, Number(cursor) || 0) % eligible.length
    : 0;
  const requestedRotation = Math.max(0, Number(rotationLimit) || 0);
  const actualRotation = Math.min(requestedRotation, eligible.length);
  const rotated = [];
  for (let index = 0; index < actualRotation; index += 1) {
    rotated.push(eligible[(normalizedCursor + index) % eligible.length]);
  }

  const candidates = [];
  const seen = new Set();
  for (const id of priorityIds) {
    const product = byId.get(id);
    if (!product || seen.has(product.id)) continue;
    seen.add(product.id);
    candidates.push(product);
  }
  const priorityCount = candidates.length;
  for (const product of rotated) {
    if (seen.has(product.id)) continue;
    seen.add(product.id);
    candidates.push(product);
  }

  return {
    candidates,
    eligibleCount: eligible.length,
    priorityCount,
    rotationCount: candidates.length - priorityCount,
    nextCursor: eligible.length
      ? (normalizedCursor + actualRotation) % eligible.length
      : 0,
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

        const source = await fetchValidatedImage(candidate.imageUrl, fetcher, {
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

async function publicProxyHasImage(candidate, proxyBase, fetcher) {
  const url = new URL(proxyBase);
  url.searchParams.set("resource", "image");
  url.searchParams.set("id", candidate.id);
  url.searchParams.set("size", "96");
  if (candidate.version) url.searchParams.set("v", candidate.version);
  try {
    await fetchValidatedImage(url, fetcher);
    return true;
  } catch {
    return false;
  }
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
  if (declaredLength > MAX_IMAGE_BYTES) throw new Error("Image exceeds the size limit.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 100 || buffer.length > MAX_IMAGE_BYTES) {
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
  const outputDirectory = requiredEnv("POSOKANEI_IMAGE_FALLBACK_OUT");
  const summaryPath = requiredEnv("POSOKANEI_IMAGE_FALLBACK_SUMMARY");
  const proxyUrls = String(requiredEnv("POSOKANEI_IMAGE_PROXY_URLS"))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const [snapshot, preview, bootstrap] = await Promise.all(
    [snapshotPath, previewPath, bootstrapPath].map(async (path) =>
      JSON.parse(await readFile(path, "utf8"))),
  );
  const selection = selectImageFallbackCandidates({
    snapshot,
    preview,
    bootstrap,
    cursor: Number(process.env.POSOKANEI_IMAGE_FALLBACK_CURSOR || 0),
    rotationLimit: Number(
      process.env.POSOKANEI_IMAGE_FALLBACK_ROTATION_LIMIT || DEFAULT_ROTATION_LIMIT,
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
    available: result.available,
    cached: result.files.length,
    failed: result.failures.length,
    next_cursor: selection.nextCursor,
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

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set.`);
  return value;
}

const isDirectRun = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) await main();
