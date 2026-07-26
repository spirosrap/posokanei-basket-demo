import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compactPrice(entry) {
  if (!entry || typeof entry !== "object") return null;
  const retailer = String(entry.retailer || entry.retailer_id || "").toLowerCase();
  const price = finiteNumber(entry.price ?? entry.final_price ?? entry.value);
  if (!retailer || price === null) return null;
  const unitPrice = finiteNumber(entry.price_normalized ?? entry.unit_price);
  return {
    retailer,
    price,
    ...(unitPrice !== null ? { price_normalized: unitPrice } : {}),
    ...(entry.price_change ? { price_change: entry.price_change } : {}),
  };
}

function compactProduct(product) {
  const retailerPricesWithUnits = (product.retailer_prices || product.prices || [])
    .filter((entry) => String(entry?.country || "GR").toUpperCase() === "GR")
    .map(compactPrice)
    .filter(Boolean);
  const retailerPrices = retailerPricesWithUnits.map((entry) => {
    const { price_normalized: _derivedUnitPrice, ...compactEntry } = entry;
    return compactEntry;
  });
  const prices = retailerPrices.map((entry) => entry.price);
  const unitPrices = retailerPricesWithUnits
    .map((entry) => entry.price_normalized)
    .filter((value) => Number.isFinite(value));

  return {
    id: product.id,
    name: product.name,
    ...(product.gtin ? { gtin: product.gtin } : {}),
    ...(product.brand ? { brand: product.brand } : {}),
    ...(product.category ? { category: product.category } : {}),
    ...(Array.isArray(product.category_ids) && product.category_ids.length
      ? { category_ids: product.category_ids }
      : {}),
    ...(product.subcategory ? { subcategory: product.subcategory } : {}),
    ...(product.has_image ? { has_image: true } : {}),
    ...(product.image_version ? { image_version: product.image_version } : {}),
    unit: product.unit,
    unit_quantity: product.unit_quantity,
    min_price: prices.length ? Math.min(...prices) : null,
    min_unit_price: unitPrices.length ? Math.min(...unitPrices) : null,
    retailer_prices: retailerPrices,
  };
}

export function createRuntimeCatalog(snapshot) {
  return {
    generated_at: snapshot.generated_at,
    source: snapshot.source,
    stats: snapshot.stats,
    price_change_stats: snapshot.price_change_stats,
    categories: snapshot.categories,
    retailers: snapshot.retailers,
    products: Array.isArray(snapshot.products) ? snapshot.products.map(compactProduct) : [],
  };
}

export async function writeRuntimeCatalog(snapshot, outputPath) {
  const runtimeCatalog = createRuntimeCatalog(snapshot);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(runtimeCatalog)}\n`, "utf8");
  return runtimeCatalog;
}
