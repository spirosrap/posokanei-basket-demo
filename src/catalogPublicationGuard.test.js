import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCatalogCoverageProfile,
  evaluateCatalogContraction,
  evaluateCatalogCoverage,
} from "../scripts/catalog-publication-guard.mjs";

test("small catalogue movements publish immediately", () => {
  const result = evaluateCatalogContraction({
    previousCount: 10_548,
    nextCount: 10_300,
  });

  assert.equal(result.allow, true);
  assert.equal(result.reason, "within-threshold");
  assert.equal(result.nextState, null);
});

test("the first sudden catalogue contraction is withheld", () => {
  const result = evaluateCatalogContraction({
    previousCount: 10_548,
    nextCount: 10_076,
  });

  assert.equal(result.allow, false);
  assert.equal(result.reason, "confirmation-required");
  assert.equal(result.confirmations, 1);
  assert.deepEqual(result.nextState, {
    previous_product_count: 10_548,
    product_count: 10_076,
    confirmations: 1,
  });
});

test("repeated catalogue contractions still require manual approval", () => {
  const result = evaluateCatalogContraction({
    previousCount: 10_548,
    nextCount: 10_118,
    pendingState: {
      previous_product_count: 10_548,
      product_count: 10_076,
      confirmations: 1,
    },
  });

  assert.equal(result.allow, false);
  assert.equal(result.reason, "manual-approval-required");
  assert.equal(result.confirmations, 2);
  assert.equal(result.nextState.product_count, 10_118);
});

test("an explicit administrative policy can accept a confirmed contraction", () => {
  const result = evaluateCatalogContraction({
    previousCount: 10_548,
    nextCount: 10_118,
    pendingState: {
      previous_product_count: 10_548,
      product_count: 10_076,
      confirmations: 1,
    },
    allowConfirmedContraction: true,
  });

  assert.equal(result.allow, true);
  assert.equal(result.reason, "confirmed-contraction");
});

test("a materially different lower snapshot restarts confirmation", () => {
  const result = evaluateCatalogContraction({
    previousCount: 10_548,
    nextCount: 9_400,
    pendingState: {
      previous_product_count: 10_548,
      product_count: 10_076,
      confirmations: 1,
    },
  });

  assert.equal(result.allow, false);
  assert.equal(result.confirmations, 1);
  assert.equal(result.nextState.product_count, 9_400);
});

test("recovery clears a pending contraction", () => {
  const result = evaluateCatalogContraction({
    previousCount: 10_548,
    nextCount: 10_500,
    pendingState: {
      previous_product_count: 10_548,
      product_count: 10_076,
      confirmations: 1,
    },
  });

  assert.equal(result.allow, true);
  assert.equal(result.nextState, null);
});

function snapshot({ roots, retailerCounts, productCount = 1000 }) {
  const retailerIds = Object.keys(retailerCounts);
  const products = Array.from({ length: productCount }, (_, index) => ({
    id: `product-${index}`,
    retailer_prices: retailerIds
      .filter((retailerId) => index < retailerCounts[retailerId])
      .map((retailer) => ({ retailer, country: "GR", price: 1 })),
  }));
  return {
    generated_at: "2026-08-14T00:00:00.000Z",
    categories: roots.map(({ id, name, count }) => ({
      category_id: id,
      category_name: name,
      depth: 0,
      product_count: count,
    })),
    retailers: retailerIds.map((id) => ({ id, name: id })),
    products,
  };
}

test("coverage profiles count root categories, retailer products, and offers", () => {
  const profile = buildCatalogCoverageProfile(snapshot({
    roots: [{ id: "food", name: "Food", count: 700 }],
    retailerCounts: { one: 800, two: 500 },
  }));

  assert.equal(profile.product_count, 1000);
  assert.equal(profile.total_offers, 1300);
  assert.deepEqual(profile.root_categories[0], {
    id: "food",
    name: "Food",
    product_count: 700,
  });
  assert.equal(profile.retailers.find(({ id }) => id === "two").product_count, 500);
});

test("a repeated root-category collapse remains blocked", () => {
  const previousSnapshot = snapshot({
    roots: [
      { id: "food", name: "Food", count: 5884 },
      { id: "pets", name: "Pets", count: 247 },
    ],
    retailerCounts: { one: 900, two: 700 },
  });
  const nextSnapshot = snapshot({
    roots: [
      { id: "food", name: "Food", count: 5517 },
      { id: "pets", name: "Pets", count: 230 },
    ],
    retailerCounts: { one: 900, two: 700 },
  });
  const result = evaluateCatalogCoverage({ previousSnapshot, nextSnapshot });

  assert.equal(result.allow, false);
  assert.deepEqual(
    result.anomalies.filter(({ scope }) => scope === "root_category").map(({ id }) => id),
    ["food", "pets"],
  );
});

test("a retailer feed collapse is blocked even when products remain searchable", () => {
  const roots = [{ id: "food", name: "Food", count: 1000 }];
  const result = evaluateCatalogCoverage({
    previousSnapshot: snapshot({ roots, retailerCounts: { one: 900, two: 700 } }),
    nextSnapshot: snapshot({ roots, retailerCounts: { one: 900, two: 100 } }),
  });

  assert.equal(result.allow, false);
  assert.ok(result.anomalies.some(({ scope, id }) => scope === "retailer" && id === "two"));
  assert.ok(result.anomalies.some(({ scope }) => scope === "offers"));
});

test("ordinary coverage movement publishes without an anomaly", () => {
  const previousSnapshot = snapshot({
    roots: [{ id: "food", name: "Food", count: 1000 }],
    retailerCounts: { one: 900, two: 700 },
  });
  const nextSnapshot = snapshot({
    roots: [{ id: "food", name: "Food", count: 970 }],
    retailerCounts: { one: 870, two: 660 },
  });

  assert.equal(evaluateCatalogCoverage({ previousSnapshot, nextSnapshot }).allow, true);
});
