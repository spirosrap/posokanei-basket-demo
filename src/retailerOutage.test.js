import assert from "node:assert/strict";
import test from "node:test";
import { prepareRetailerOutage } from "../scripts/retailer-outage.mjs";
import { evaluateCatalogCoverage, evaluateCatalogContraction } from "../scripts/catalog-publication-guard.mjs";
import { createRuntimeCatalog } from "../scripts/catalog-runtime.mjs";
import { normalizeProduct } from "./posokaneiApi.js";
import { calculateVisitPlan } from "./pricing.js";

function fixture({ missing = false, otherCount = 800, date = "2026-09-28T09:00:00Z" } = {}) {
  const products = Array.from({ length: otherCount }, (_, i) => ({
    id: `shared-${i}`, name: `Shared ${i}`, category_ids: ["food"],
    retailer_prices: ["one", "two"].map((retailer) => ({ retailer, price: 2, country: "GR" })),
  }));
  if (!missing) products.push(...Array.from({ length: 100 }, (_, i) => ({
    id: `exclusive-${i}`, name: `Exclusive ${i}`, category_ids: ["food"],
    min_price: 1, price_stats: { min_price: 1 }, updated_at: date,
    retailer_prices: [{ retailer: "lidl", price: 1, country: "GR", price_history: [{ price: 1 }] }],
  })));
  return { generated_at: date, products, retailers: [{ id: "lidl", name: "Lidl" }],
    coverage: { root_categories: [{ category_id: "food", product_count: products.length }] } };
}

test("isolates one missing feed without retaining any price or removing saved product IDs", () => {
  const previous = fixture();
  const candidate = fixture({ missing: true, date: "2026-09-28T10:00:00Z" });
  const { snapshot, comparisonPrevious } = prepareRetailerOutage(previous, candidate);
  assert.equal(snapshot.products.length, 900);
  assert.equal(snapshot.availability.retained_unpriced_products, 100);
  assert.equal(snapshot.availability.unavailable_retailers[0].last_available_at, previous.generated_at);
  const stub = snapshot.products.find((p) => p.id === "exclusive-0");
  assert.deepEqual(stub, { id: "exclusive-0", name: "Exclusive 0", category_ids: ["food"], retailer_prices: [], unavailable_retailer: "lidl" });
  const runtime = createRuntimeCatalog(snapshot).products.find((p) => p.id === stub.id);
  assert.equal(runtime.min_price, null);
  assert.deepEqual(normalizeProduct(runtime).prices, {});
  assert.equal(normalizeProduct(runtime).priceHistory, null);
  const plan = calculateVisitPlan([{ productId: runtime.id, quantity: 2 }], [normalizeProduct(runtime)], [{ id: "lidl", name: "Lidl" }], 1);
  assert.equal(plan.isComplete, false);
  assert.equal(plan.missingItems[0].product.id, runtime.id);
  assert.equal(evaluateCatalogCoverage({ previousSnapshot: comparisonPrevious, nextSnapshot: candidate }).allow, true);
  assert.equal(evaluateCatalogContraction({ previousCount: comparisonPrevious.products.length, nextCount: candidate.products.length }).allow, true);
  assert.equal(previous.products.length, 900);
  assert.equal(candidate.products.length, 800);
});

test("an unrelated category or product loss still fails publication guards", () => {
  const candidate = fixture({ missing: true, otherCount: 600 });
  const { comparisonPrevious } = prepareRetailerOutage(fixture(), candidate);
  const coverage = evaluateCatalogCoverage({ previousSnapshot: comparisonPrevious, nextSnapshot: candidate });
  assert.equal(coverage.allow, false);
  assert.ok(coverage.anomalies.some((a) => a.scope === "root_category"));
  assert.ok(coverage.anomalies.some((a) => a.scope === "retailer" && a.id === "one"));
  assert.equal(evaluateCatalogContraction({ previousCount: comparisonPrevious.products.length, nextCount: candidate.products.length }).allow, false);
});

test("repeated outage preserves dates and identities without repeatedly reducing root counts", () => {
  const candidate = fixture({ missing: true });
  const first = prepareRetailerOutage(fixture({ date: "2026-09-27T20:00:00Z" }), candidate).snapshot;
  const next = { ...candidate, generated_at: "2026-09-28T11:00:00Z" };
  const second = prepareRetailerOutage(first, next);
  assert.deepEqual(second.snapshot.availability, first.availability);
  assert.equal(second.comparisonPrevious.coverage.root_categories[0].product_count, 800);
  assert.equal(second.snapshot.products.length, 900);
  assert.equal(evaluateCatalogCoverage({ previousSnapshot: second.comparisonPrevious, nextSnapshot: next }).allow, true);
});

test("source recovery restores current prices and clears the warning automatically", () => {
  const partial = prepareRetailerOutage(fixture(), fixture({ missing: true })).snapshot;
  const recovered = fixture({ date: "2026-09-28T12:00:00Z" });
  const result = prepareRetailerOutage(partial, recovered);
  assert.equal(result.snapshot, recovered);
  assert.equal(result.snapshot.availability, undefined);
  assert.equal(normalizeProduct(result.snapshot.products.at(-1)).prices.lidl, 1);
  recovered.products = recovered.products.filter((p) => !p.id.startsWith("exclusive-") || p.id === "exclusive-0");
  assert.throws(() => prepareRetailerOutage(partial, recovered), { code: "catalog_coverage_degraded" });
});

test("multiple missing feeds, a dominant missing chain, and missing attribution fail closed", () => {
  const previous = fixture();
  const candidate = fixture({ missing: true });
  const noTwo = { ...candidate, products: candidate.products.map((p) => ({ ...p, retailer_prices: p.retailer_prices.slice(0, 1) })) };
  assert.throws(() => prepareRetailerOutage(previous, noTwo), { code: "catalog_coverage_degraded" });
  assert.throws(() => prepareRetailerOutage(fixture({ otherCount: 100 }), fixture({ missing: true, otherCount: 100 })), { code: "catalog_coverage_degraded" });
  assert.throws(() => prepareRetailerOutage({ ...previous, coverage: null }, candidate), /Cannot attribute/);
});
