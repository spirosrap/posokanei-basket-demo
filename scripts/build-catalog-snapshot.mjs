#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const API_ORIGIN = "https://api.posokanei.gov.gr";
const PAGE_SIZE = Number(process.env.POSOKANEI_SNAPSHOT_PAGE_SIZE || 100);
const outputPath = resolve(process.env.POSOKANEI_SNAPSHOT_OUT || "public/data/catalog.json");

async function fetchJson(path, options = {}) {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "User-Agent": "agenticspiros-posokanei-snapshot/1.0",
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }

  return response.json();
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

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot)}\n`, "utf8");

console.log(
  `Wrote ${products.length} products, ${snapshot.categories.length} categories, ${snapshot.retailers.length} retailers to ${outputPath}`,
);
