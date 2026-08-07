#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { writeCatalogBootstrap } from "./catalog-bootstrap.mjs";
import { writeRuntimeCatalog } from "./catalog-runtime.mjs";
import {
  finalizeCatalogProducts,
  getCatalogRootSegments,
  mergeCatalogProducts,
} from "./catalog-snapshot-coverage.mjs";
import {
  writePriceChangesCsv,
  writePriceChangesJson,
  writePriceChangesPreviewJson,
} from "./price-change-export.mjs";
import { annotatePriceChanges } from "./price-change-history.mjs";

const API_ORIGIN = "https://api.posokanei.gov.gr";
const PAGE_SIZE = Number(process.env.POSOKANEI_SNAPSHOT_PAGE_SIZE || 100);
const FETCH_ATTEMPTS = Number(process.env.POSOKANEI_FETCH_ATTEMPTS || 4);
const RETRY_BASE_DELAY_MS = Number(process.env.POSOKANEI_RETRY_BASE_DELAY_MS || 1200);
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const USER_AGENT =
  process.env.POSOKANEI_USER_AGENT ||
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const REQUEST_TIMEOUT_SECONDS = Number(process.env.POSOKANEI_REQUEST_TIMEOUT_SECONDS || 30);
const execFileAsync = promisify(execFile);
const outputPath = resolve(process.env.POSOKANEI_SNAPSHOT_OUT || "public/data/catalog.json");
const metaOutputPath = resolve(
  process.env.POSOKANEI_META_OUT ||
    outputPath.replace(/catalog\.json$/, "catalog-meta.json"),
);
const runtimeOutputPath = resolve(
  process.env.POSOKANEI_RUNTIME_OUT ||
    outputPath.replace(/catalog\.json$/, "catalog-runtime.json"),
);
const bootstrapOutputPath = resolve(
  process.env.POSOKANEI_BOOTSTRAP_OUT ||
    outputPath.replace(/catalog\.json$/, "catalog-bootstrap.json"),
);
const priceChangesOutputPath = resolve(
  process.env.POSOKANEI_PRICE_CHANGES_OUT ||
    outputPath.replace(/catalog\.json$/, "price-changes.csv"),
);
const priceChangesJsonOutputPath = resolve(
  process.env.POSOKANEI_PRICE_CHANGES_JSON_OUT ||
    outputPath.replace(/catalog\.json$/, "price-changes.json"),
);
const priceChangesPreviewOutputPath = resolve(
  process.env.POSOKANEI_PRICE_CHANGES_PREVIEW_OUT ||
    outputPath.replace(/catalog\.json$/, "price-changes-preview.json"),
);
const previousSnapshotPath = process.env.POSOKANEI_PREVIOUS_SNAPSHOT
  ? resolve(process.env.POSOKANEI_PREVIOUS_SNAPSHOT)
  : "";

async function fetchJson(path, options = {}) {
  let lastError;

  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    try {
      return await fetchJsonWithCurl(path, options);
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      const retryable = !status || RETRYABLE_STATUSES.has(status);
      if (!retryable || attempt >= FETCH_ATTEMPTS) {
        throw error;
      }

      const delayMs = RETRY_BASE_DELAY_MS * attempt;
      process.stderr.write(
        `Retrying ${path} after ${error.message} (${attempt}/${FETCH_ATTEMPTS})\n`,
      );
      await sleep(delayMs);
    }
  }

  throw lastError || new Error(`${path} failed`);
}

async function fetchJsonWithCurl(path, options = {}) {
  const statusMarker = "\n__POSOKANEI_HTTP_STATUS__:";
  const headers = {
    Accept: "application/json",
    "Accept-Language": "el-GR,el;q=0.9,en;q=0.8",
    "User-Agent": USER_AGENT,
    ...options.headers,
  };
  const args = [
    "--silent",
    "--show-error",
    "--location",
    "--compressed",
    "--max-time",
    String(REQUEST_TIMEOUT_SECONDS),
  ];
  for (const [name, value] of Object.entries(headers)) {
    args.push("--header", `${name}: ${value}`);
  }
  if (options.method) args.push("--request", options.method);
  if (options.body) args.push("--data-binary", String(options.body));
  args.push("--write-out", `${statusMarker}%{http_code}`, `${API_ORIGIN}${path}`);

  const { stdout } = await execFileAsync("curl", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const markerIndex = stdout.lastIndexOf(statusMarker);
  if (markerIndex < 0) throw new Error(`${path} returned an unreadable response`);

  const body = stdout.slice(0, markerIndex);
  const status = Number(stdout.slice(markerIndex + statusMarker.length).trim());
  if (status < 200 || status >= 300) {
    const error = new Error(`${path} returned HTTP ${status}`);
    error.status = status;
    throw error;
  }

  return JSON.parse(body);
}

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

async function fetchProductSegment(productsById, segment) {
  const segmentProducts = new Map();
  let page = 1;
  let totalPages = 1;
  let reportedTotal = 0;

  do {
    const body = JSON.stringify({
      category_id: segment.id,
      page,
      page_size: PAGE_SIZE,
      countries: ["GR"],
      sort_by: "name",
      sort_order: "asc",
    });
    const raw = await fetchJson("/products/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const rows = Array.isArray(raw.products) ? raw.products : [];
    mergeCatalogProducts(segmentProducts, rows);
    const added = mergeCatalogProducts(productsById, rows);
    reportedTotal = Number(raw.total || reportedTotal || segment.expectedCount || 0);
    totalPages = Number(raw.total_pages || page) || page;
    process.stdout.write(
      `Fetched ${segment.name} page ${page}/${totalPages} `
      + `(${productsById.size} unique, ${added} new)\n`,
    );
    page += 1;
  } while (page <= totalPages);

  if (reportedTotal > 0 && segmentProducts.size < reportedTotal) {
    throw new Error(
      `Incomplete category ${segment.name}: collected `
      + `${segmentProducts.size} of ${reportedTotal} products`,
    );
  }

  return reportedTotal || segmentProducts.size;
}

async function fetchProducts(categories) {
  const segments = getCatalogRootSegments(categories);
  if (!segments.length) {
    throw new Error("No root catalogue categories were returned by PosoKanei");
  }

  const productsById = new Map();
  let expectedTotal = 0;
  for (const segment of segments) {
    expectedTotal += await fetchProductSegment(productsById, segment);
  }

  return finalizeCatalogProducts(productsById, expectedTotal);
}

// Keep the catalogue crawl serial. A 403 is not retried inside one run because
// the same request will remain denied; the scheduled refresh is the retry boundary.
const stats = await fetchJson("/meta/stats");
const categoriesRaw = await fetchJson("/meta/categories");
const retailersRaw = await fetchJson("/meta/retailers?countries=GR");
const categories = categoriesRaw.categories || categoriesRaw;
const products = await fetchProducts(categories);

const rawSnapshot = {
  generated_at: new Date().toISOString(),
  source: API_ORIGIN,
  stats,
  categories,
  retailers: retailersRaw.retailers || retailersRaw,
  products,
};
const previousSnapshot = previousSnapshotPath
  ? await readPreviousSnapshot(previousSnapshotPath)
  : null;
const { snapshot, stats: priceChangeStats } = annotatePriceChanges(
  rawSnapshot,
  previousSnapshot,
);
const metadata = {
  generated_at: snapshot.generated_at,
  source: snapshot.source,
  stats: {
    ...stats,
    total_products: products.length || stats.total_products,
    active_products: products.length || stats.active_products || stats.total_products,
  },
  categories: snapshot.categories,
  retailers: snapshot.retailers,
  price_change_stats: priceChangeStats,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot)}\n`, "utf8");
await mkdir(dirname(metaOutputPath), { recursive: true });
await writeFile(metaOutputPath, `${JSON.stringify(metadata)}\n`, "utf8");
const runtimeCatalog = await writeRuntimeCatalog(snapshot, runtimeOutputPath);
await writeCatalogBootstrap(runtimeCatalog, bootstrapOutputPath);
const exportedPriceChanges = await writePriceChangesCsv(snapshot, priceChangesOutputPath);
await writePriceChangesJson(snapshot, priceChangesJsonOutputPath);
await writePriceChangesPreviewJson(snapshot, priceChangesPreviewOutputPath);

console.log(
  `Wrote ${products.length} products, ${snapshot.categories.length} categories, ${snapshot.retailers.length} retailers to ${outputPath}`,
);
console.log(`Wrote catalogue metadata to ${metaOutputPath}`);
console.log(`Wrote compact runtime catalogue to ${runtimeOutputPath}`);
console.log(`Wrote static startup catalogue to ${bootstrapOutputPath}`);
console.log(`Wrote ${exportedPriceChanges} price changes to ${priceChangesOutputPath}`);
console.log(`Wrote price-change display data to ${priceChangesJsonOutputPath}`);
console.log(`Wrote initial price-change preview to ${priceChangesPreviewOutputPath}`);
console.log(
  `Price changes: ${priceChangeStats.new_changes} new, ${priceChangeStats.active_offers} active across ${priceChangeStats.products_with_recent_changes} products`,
);

async function readPreviousSnapshot(filePath) {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    if (!Array.isArray(parsed?.products)) throw new Error("products are missing");
    console.log(
      `Comparing prices with ${parsed.products.length} products from ${parsed.generated_at || "the previous snapshot"}`,
    );
    return parsed;
  } catch (error) {
    console.error(`Previous snapshot could not be read; price history starts empty: ${error.message}`);
    return null;
  }
}
