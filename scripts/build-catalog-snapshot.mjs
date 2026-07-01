#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const API_ORIGIN = "https://api.posokanei.gov.gr";
const PAGE_SIZE = Number(process.env.POSOKANEI_SNAPSHOT_PAGE_SIZE || 100);
const FETCH_ATTEMPTS = Number(process.env.POSOKANEI_FETCH_ATTEMPTS || 4);
const RETRY_BASE_DELAY_MS = Number(process.env.POSOKANEI_RETRY_BASE_DELAY_MS || 1200);
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const USER_AGENT =
  process.env.POSOKANEI_USER_AGENT ||
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const outputPath = resolve(process.env.POSOKANEI_SNAPSHOT_OUT || "public/data/catalog.json");
const metaOutputPath = resolve(
  process.env.POSOKANEI_META_OUT ||
    outputPath.replace(/catalog\.json$/, "catalog-meta.json"),
);

async function fetchJson(path, options = {}) {
  let lastError;

  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${API_ORIGIN}${path}`, {
        ...options,
        headers: {
          Accept: "application/json",
          "Accept-Language": "el-GR,el;q=0.9,en;q=0.8",
          "User-Agent": USER_AGENT,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = new Error(`${path} returned HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }

      return response.json();
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

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

async function fetchProducts() {
  const products = [];
  let page = 1;
  let totalPages = 1;

  do {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(PAGE_SIZE),
      countries: "GR",
      sort_by: "name",
      sort_order: "asc",
    });
    const raw = await fetchJson(`/products?${params}`);
    const rows = Array.isArray(raw.products) ? raw.products : [];
    products.push(...rows);
    totalPages = Number(raw.total_pages || page) || page;
    process.stdout.write(`Fetched products page ${page}/${totalPages} (${products.length})\n`);
    page += 1;
  } while (page <= totalPages);

  return products;
}

const [stats, categoriesRaw, retailersRaw, products] = await Promise.all([
  fetchJson("/meta/stats"),
  fetchJson("/meta/categories"),
  fetchJson("/meta/retailers?countries=GR"),
  fetchProducts(),
]);

const snapshot = {
  generated_at: new Date().toISOString(),
  source: API_ORIGIN,
  stats,
  categories: categoriesRaw.categories || categoriesRaw,
  retailers: retailersRaw.retailers || retailersRaw,
  products,
};
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
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot)}\n`, "utf8");
await mkdir(dirname(metaOutputPath), { recursive: true });
await writeFile(metaOutputPath, `${JSON.stringify(metadata)}\n`, "utf8");

console.log(
  `Wrote ${products.length} products, ${snapshot.categories.length} categories, ${snapshot.retailers.length} retailers to ${outputPath}`,
);
console.log(`Wrote catalogue metadata to ${metaOutputPath}`);
