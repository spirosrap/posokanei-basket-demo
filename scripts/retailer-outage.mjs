import { buildCatalogCoverageProfile } from "./catalog-publication-guard.mjs";

const greekOffers = (product) => (product.retailer_prices || [])
  .filter((offer) => String(offer.country || "GR").toUpperCase() === "GR");
const retailerId = (offer) => String(offer.retailer || offer.retailer_id || "").toLowerCase();

// A single missing feed must not freeze every other chain. Its prices are never
// carried forward: only product identities survive, so saved baskets remain intact.
export function prepareRetailerOutage(previous, candidate) {
  const before = buildCatalogCoverageProfile(previous);
  const after = buildCatalogCoverageProfile(candidate);
  const priorOutages = previous.availability?.unavailable_retailers || [];
  const referenceCounts = new Map(before.retailers.map((row) => [row.id, row]));
  for (const row of priorOutages) {
    referenceCounts.set(row.id, { ...row, product_count: row.previous_count });
  }
  const nextCounts = new Map(after.retailers.map((row) => [row.id, row.product_count]));
  // Partial reappearance is not proof of recovery. Keep the last published state
  // until the returning feed meets the normal 20% retailer coverage threshold.
  for (const row of priorOutages) {
    const count = nextCounts.get(row.id) || 0;
    if (count > 0 && count < row.previous_count * 0.8) {
      const error = new Error(`Retailer ${row.name} has only partially recovered (${count}/${row.previous_count}).`);
      error.code = "catalog_coverage_degraded";
      throw error;
    }
  }
  const missing = [...referenceCounts.values()]
    .filter((row) => row.product_count >= 100 && !nextCounts.get(row.id));
  const missingOffers = missing.reduce((sum, row) => sum + row.product_count, 0);
  const referenceOffers = before.total_offers
    + priorOutages.reduce((sum, row) => sum + row.previous_count, 0);
  if (!missing.length) return { snapshot: candidate, comparisonPrevious: previous };
  if (missing.length !== 1 || after.retailers.length < 2
    || missingOffers > referenceOffers * 0.2) {
    const error = new Error("Missing retailer coverage is too broad for partial publication.");
    error.code = "catalog_coverage_degraded";
    throw error;
  }
  const missingIds = new Set(missing.map((row) => row.id));
  const removed = [];
  const comparisonProducts = [];
  const retainable = [];
  for (const product of previous.products) {
    if (product.unavailable_retailer && missingIds.has(product.unavailable_retailer)) {
      retainable.push(product);
      continue; // Already excluded from the previous source's category counts.
    }
    const offers = greekOffers(product);
    const remaining = offers.filter((offer) => !missingIds.has(retailerId(offer)));
    if (offers.length && !remaining.length) {
      removed.push(product);
      retainable.push(product);
    } else {
      comparisonProducts.push({ ...product, retailer_prices: remaining });
    }
  }
  // Adjust only the part of the baseline explained by the missing feed. All
  // other category, retailer, offer and total-product guards still run normally.
  const roots = previous.coverage?.root_categories;
  if (!Array.isArray(roots) || removed.some((p) => !Array.isArray(p.category_ids))) {
    throw new Error("Cannot attribute missing-feed products to source categories.");
  }
  const comparisonPrevious = {
    ...previous,
    products: comparisonProducts,
    coverage: {
      ...previous.coverage,
      root_categories: roots.map((root) => ({
        ...root,
        product_count: Math.max(0, root.product_count - removed.filter((product) =>
          product.category_ids.includes(root.category_id)).length),
      })),
    },
  };
  const products = [...candidate.products];
  const ids = new Set(products.map((p) => p.id));
  for (const product of retainable) {
    if (ids.has(product.id)) continue;
    const identity = {};
    for (const key of ["id", "name", "brand", "gtin", "barcode", "category", "category_ids",
      "subcategory", "description", "unit", "unit_quantity", "has_image", "image_version", "image_url"]) {
      if (product[key] !== undefined) identity[key] = product[key];
    }
    products.push({ ...identity, retailer_prices: [], unavailable_retailer: missing[0].id });
  }
  const availability = {
    unavailable_retailers: missing.map((row) => {
      const prior = priorOutages.find((entry) => entry.id === row.id);
      return {
        id: row.id, name: row.name, previous_count: row.product_count,
        last_available_at: prior?.last_available_at || previous.generated_at,
        unavailable_since: prior?.unavailable_since || candidate.generated_at,
      };
    }),
    source_product_count: candidate.products.length,
    retained_unpriced_products: products.length - candidate.products.length,
  };
  return {
    comparisonPrevious,
    snapshot: { ...candidate, products, availability },
  };
}
