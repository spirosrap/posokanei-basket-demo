import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DEFAULT_DEMO_PRODUCT_IDS } from "../src/demoBasket.js";

const PAGE_SIZE = 30;
const CATEGORY_LIMIT = 80;
const SORT_MODES = ["price", "unit_price", "name"];

function compareNullableNumber(left, right, field) {
  const leftValue = Number(left[field]);
  const rightValue = Number(right[field]);
  const leftValid = Number.isFinite(leftValue);
  const rightValid = Number.isFinite(rightValue);
  if (!leftValid && rightValid) return 1;
  if (leftValid && !rightValid) return -1;
  if (leftValid && rightValid && leftValue !== rightValue) return leftValue - rightValue;
  return String(left.name || "").localeCompare(String(right.name || ""), "el");
}

function compareProducts(left, right, sortMode) {
  if (sortMode === "name") {
    return String(left.name || "").localeCompare(String(right.name || ""), "el");
  }
  return compareNullableNumber(
    left,
    right,
    sortMode === "unit_price" ? "min_unit_price" : "min_price",
  );
}

function compactStats(stats, productCount) {
  return {
    total_products: productCount,
    active_products: productCount,
    retailer_count: Number(stats?.retailer_count || 0),
    products_on_discount: Number(stats?.products_on_discount || 0),
    timestamp: stats?.timestamp || "",
  };
}

function compactCategories(categories) {
  return (Array.isArray(categories) ? categories : [])
    .filter((category) => Number(category?.product_count || 0) > 0)
    .sort(
      (left, right) =>
        Number(right.product_count || 0) - Number(left.product_count || 0) ||
        String(left.category_name || "").localeCompare(
          String(right.category_name || ""),
          "el",
        ),
    )
    .slice(0, CATEGORY_LIMIT)
    .map((category) => ({
      category_id: category.category_id,
      category_name: category.category_name,
      product_count: Number(category.product_count || 0),
    }));
}

function compactRetailers(retailers) {
  return (Array.isArray(retailers) ? retailers : [])
    .filter((retailer) => String(retailer?.country || "GR").toUpperCase() === "GR")
    .map((retailer) => ({
      id: retailer.id || retailer.retailer,
      name: retailer.name || retailer.retailer_display_name,
      country: "GR",
      ...(retailer.logo_url ? { logo_url: retailer.logo_url } : {}),
    }));
}

export function createCatalogBootstrap(runtimeCatalog, pageSize = PAGE_SIZE) {
  const products = Array.isArray(runtimeCatalog?.products) ? runtimeCatalog.products : [];
  const pages = Object.fromEntries(
    SORT_MODES.map((sortMode) => [
      sortMode,
      [...products]
        .sort((left, right) => compareProducts(left, right, sortMode))
        .slice(0, pageSize)
        .map((product) => String(product.id)),
    ]),
  );
  const includedIds = new Set([
    ...Object.values(pages).flat(),
    ...DEFAULT_DEMO_PRODUCT_IDS,
  ]);

  return {
    generated_at: runtimeCatalog.generated_at,
    source: runtimeCatalog.source,
    stats: compactStats(runtimeCatalog.stats, products.length),
    price_change_stats: runtimeCatalog.price_change_stats,
    categories: compactCategories(runtimeCatalog.categories),
    retailers: compactRetailers(runtimeCatalog.retailers),
    total_products: products.length,
    page_size: pageSize,
    pages,
    products: products.filter((product) => includedIds.has(String(product.id))),
  };
}

export async function writeCatalogBootstrap(runtimeCatalog, outputPath) {
  const bootstrap = createCatalogBootstrap(runtimeCatalog);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(bootstrap)}\n`, "utf8");
  return bootstrap;
}
