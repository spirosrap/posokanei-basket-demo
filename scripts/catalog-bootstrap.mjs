import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DEFAULT_DEMO_PRODUCT_IDS } from "../src/demoBasket.js";

const PAGE_SIZE = 30;
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
    stats: runtimeCatalog.stats,
    categories: runtimeCatalog.categories,
    retailers: runtimeCatalog.retailers,
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
