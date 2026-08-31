import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCatalogCoverageProfile,
  evaluateCatalogContraction,
  evaluateCatalogCoverage,
  evaluateCoverageBaselineConfirmation,
  parseRetailerBaselineApprovals,
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

function retailerOnlyCoverageAssessment(nextCount = 500) {
  const roots = [{ id: "food", name: "Food", count: 1000 }];
  const stableRetailers = Object.fromEntries(
    Array.from({ length: 9 }, (_, index) => [`stable-${index}`, 900]),
  );
  return evaluateCatalogCoverage({
    previousSnapshot: snapshot({
      roots,
      retailerCounts: { ...stableRetailers, changing: 700 },
    }),
    nextSnapshot: snapshot({
      roots,
      retailerCounts: { ...stableRetailers, changing: nextCount },
    }),
  });
}

test("a stable retailer baseline needs both repeated snapshots and enough elapsed time", () => {
  const coverageAssessment = retailerOnlyCoverageAssessment();
  const first = evaluateCoverageBaselineConfirmation({
    coverageAssessment,
    requiredConfirmations: 2,
    minimumAgeMs: 6 * 60 * 60 * 1000,
    observedAt: "2026-08-30T00:00:00.000Z",
  });
  const tooSoon = evaluateCoverageBaselineConfirmation({
    coverageAssessment,
    pendingState: first.nextState,
    requiredConfirmations: 2,
    minimumAgeMs: 6 * 60 * 60 * 1000,
    observedAt: "2026-08-30T01:00:00.000Z",
  });
  const confirmed = evaluateCoverageBaselineConfirmation({
    coverageAssessment,
    pendingState: tooSoon.nextState,
    requiredConfirmations: 2,
    minimumAgeMs: 6 * 60 * 60 * 1000,
    observedAt: "2026-08-30T06:00:00.000Z",
  });

  assert.equal(first.allow, false);
  assert.equal(first.confirmations, 1);
  assert.equal(tooSoon.allow, false);
  assert.equal(tooSoon.confirmations, 2);
  assert.equal(confirmed.allow, true);
  assert.equal(confirmed.reason, "confirmed-retailer-baseline");
  assert.equal(confirmed.confirmations, 3);
});

test("a materially different retailer baseline restarts confirmation", () => {
  const first = evaluateCoverageBaselineConfirmation({
    coverageAssessment: retailerOnlyCoverageAssessment(500),
    observedAt: "2026-08-30T00:00:00.000Z",
  });
  const changed = evaluateCoverageBaselineConfirmation({
    coverageAssessment: retailerOnlyCoverageAssessment(450),
    pendingState: first.nextState,
    observedAt: "2026-08-30T07:00:00.000Z",
  });

  assert.equal(changed.allow, false);
  assert.equal(changed.confirmations, 1);
  assert.equal(changed.nextState.anomalies[0].next_count, 450);
});

test("root-category losses can never become a confirmed baseline", () => {
  const previousSnapshot = snapshot({
    roots: [{ id: "food", name: "Food", count: 1000 }],
    retailerCounts: { one: 900 },
  });
  const nextSnapshot = snapshot({
    roots: [{ id: "food", name: "Food", count: 800 }],
    retailerCounts: { one: 900 },
  });
  const result = evaluateCoverageBaselineConfirmation({
    coverageAssessment: evaluateCatalogCoverage({ previousSnapshot, nextSnapshot }),
    pendingState: { confirmations: 100, first_seen_at: "2026-08-01T00:00:00.000Z" },
    observedAt: "2026-08-30T00:00:00.000Z",
  });

  assert.equal(result.allow, false);
  assert.equal(result.reason, "coverage-not-confirmable");
  assert.equal(result.nextState, null);
});

test("a vanished retailer can never become a confirmed baseline", () => {
  const result = evaluateCoverageBaselineConfirmation({
    coverageAssessment: retailerOnlyCoverageAssessment(0),
    pendingState: { confirmations: 100, first_seen_at: "2026-08-01T00:00:00.000Z" },
    observedAt: "2026-08-30T00:00:00.000Z",
  });

  assert.equal(result.allow, false);
  assert.equal(result.reason, "coverage-not-confirmable");
});

test("a supervised retailer baseline approval must match every exact count", () => {
  const coverageAssessment = retailerOnlyCoverageAssessment(500);
  const approved = evaluateCoverageBaselineConfirmation({
    coverageAssessment,
    approvedRetailerBaselines: parseRetailerBaselineApprovals("changing:500"),
  });
  const mismatch = evaluateCoverageBaselineConfirmation({
    coverageAssessment,
    approvedRetailerBaselines: parseRetailerBaselineApprovals("changing:499"),
  });

  assert.equal(approved.allow, true);
  assert.equal(approved.reason, "approved-retailer-baseline");
  assert.equal(mismatch.allow, false);
});

test("an exact retailer approval cannot also approve a total-offer collapse", () => {
  const roots = [{ id: "food", name: "Food", count: 1000 }];
  const coverageAssessment = evaluateCatalogCoverage({
    previousSnapshot: snapshot({ roots, retailerCounts: { one: 900, changing: 700 } }),
    nextSnapshot: snapshot({ roots, retailerCounts: { one: 900, changing: 100 } }),
  });
  const result = evaluateCoverageBaselineConfirmation({
    coverageAssessment,
    approvedRetailerBaselines: parseRetailerBaselineApprovals("changing:100"),
  });

  assert.ok(coverageAssessment.anomalies.some(({ scope }) => scope === "offers"));
  assert.equal(result.allow, false);
  assert.equal(result.reason, "coverage-not-confirmable");
});

test("malformed retailer baseline approvals fail closed", () => {
  assert.throws(
    () => parseRetailerBaselineApprovals("changing=500"),
    /expected retailer_id:positive_count/u,
  );
});
