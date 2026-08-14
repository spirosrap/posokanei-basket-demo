import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCatalogContraction } from "../scripts/catalog-publication-guard.mjs";

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

test("a second complete snapshot in the same contraction band is accepted", () => {
  const result = evaluateCatalogContraction({
    previousCount: 10_548,
    nextCount: 10_118,
    pendingState: {
      previous_product_count: 10_548,
      product_count: 10_076,
      confirmations: 1,
    },
  });

  assert.equal(result.allow, true);
  assert.equal(result.reason, "confirmed-contraction");
  assert.equal(result.confirmations, 2);
  assert.equal(result.nextState, null);
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
