import { readFile } from "node:fs/promises";
import { getCatalogRootSegments } from "./catalog-snapshot-coverage.mjs";
import { writeSnapshotFiles } from "./write-snapshot-files.mjs";

const base = "https://raw.githubusercontent.com/spyrosavl/posokanei/main/";
const day = 86400000;

async function download(path, limit) {
  const response = await fetch(base + path, { redirect: "error", signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Archive returned HTTP ${response.status}`);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > limit) throw new Error("Archive exceeds size limit");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function archiveSnapshot(archive, index, previousAt, now = Date.now()) {
  const time = Date.parse(archive.fetched_at);
  const previous = Date.parse(previousAt);
  if (!Number.isFinite(previous) || !Number.isFinite(time) || time <= previous ||
      time > now || now - time > day) throw new Error("Archive is older than the live catalogue or outside its daily window");
  const generatedAt = new Date(time).toISOString();
  if (archive.date !== index.date || generatedAt.slice(0, 10) !== archive.date ||
      archive.source !== "https://api.posokanei.gov.gr" ||
      !Number.isInteger(archive.total) || archive.total <= 0 ||
      archive.collected !== archive.total || index.total !== archive.total ||
      index.collected !== archive.collected || archive.products.length !== archive.collected) {
    throw new Error("Archive identity or completeness mismatch");
  }
  const categories = archive.categories.categories;
  const roots = getCatalogRootSegments(categories);
  if (roots.reduce((n, root) => n + root.expectedCount, 0) !== archive.total) {
    throw new Error("Archive category totals do not cover the catalogue");
  }
  const retailers = archive.retailers.retailers.filter(row => row.country === "GR");
  const retailerIds = new Set(retailers.map(row => row.id));
  const seen = new Set();
  const products = [];
  let discounts = 0;
  for (const product of archive.products) {
    if (!product.id || !product.name || seen.has(product.id) || !Array.isArray(product.category_ids)) {
      throw new Error("Invalid or duplicate product in archive");
    }
    seen.add(product.id);
    const offers = product.retailer_prices.filter(offer => offer.country === "GR");
    if (!offers.length && !product.available_countries?.includes("GR")) continue;
    if (offers.some(offer => !retailerIds.has(offer.retailer) || !Number.isFinite(offer.price) || offer.price <= 0)) {
      throw new Error("Invalid Greek retailer price in archive");
    }
    const prices = offers.map(o => o.price);
    const units = offers.map(o => o.price_normalized).filter(n => Number.isFinite(n) && n > 0);
    if (offers.some(o => o.is_discount)) discounts++;
    products.push({ ...product, retailer_prices: offers, retailers: [...new Set(offers.map(o => o.retailer))],
      price_stats: { min_price: prices.length ? Math.min(...prices) : null,
        max_price: prices.length ? Math.max(...prices) : null,
        avg_price: prices.length ? prices.reduce((a,b) => a+b,0) / prices.length : null,
        min_unit_price: units.length ? Math.min(...units) : null, retailer_count: new Set(offers.map(o => o.retailer)).size } });
  }
  // Root counts from an international export must agree with the Greek product set.
  const rootCategories = roots.map(root => {
    const count = products.filter(p => p.category_ids.includes(root.id)).length;
    if (count !== root.expectedCount) throw new Error("Greek product membership differs from archive category totals");
    return { category_id: root.id, category_name: root.name, product_count: count };
  });
  return { generated_at: generatedAt, source: base + index.path, products, categories, retailers,
    stats: { active_products: products.length, total_products: products.length,
      retailer_count: retailers.length, retailers: [...retailerIds], products_on_discount: discounts, timestamp: generatedAt },
    coverage: { schema_version: 1, root_categories: rootCategories } };
}

export async function buildArchiveFallback(previousPath, paths) {
  const previous = JSON.parse(await readFile(previousPath, "utf8"));
  const index = await download("data/latest.json", 4096);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(index.date) ||
      index.path !== `data/${index.date.slice(0,4)}/posokanei-${index.date}.json`) {
    throw new Error("Invalid daily archive index");
  }
  if (index.date < previous.generated_at.slice(0, 10)) throw new Error(`Latest archive is dated ${index.date}`);
  const archive = await download(index.path, 128 * 1024 * 1024);
  const candidate = archiveSnapshot(archive, index, previous.generated_at);
  await writeSnapshotFiles(candidate, previous, paths);
  console.log(`Using daily archive collected ${candidate.generated_at} from ${candidate.source}`);
}
