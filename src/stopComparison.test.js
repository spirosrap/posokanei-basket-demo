import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateStopComparison,
  normalizeExtraStopCost,
} from "./stopComparison.js";

const retailers = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
  { id: "c", name: "C" },
];
const products = [
  { id: "one", name: "One", prices: { a: 8, b: 4, c: 9 } },
  { id: "two", name: "Two", prices: { a: 2, b: 9, c: 4 } },
];
const basket = [
  { productId: "one", quantity: 1 },
  { productId: "two", quantity: 1 },
];

test("compares every stop limit against the same one-stop baseline", () => {
  const comparison = calculateStopComparison(basket, products, retailers, 0);

  assert.equal(comparison.options.length, 4);
  assert.equal(comparison.oneStopTotal, 10);
  assert.equal(comparison.options[1].groceryTotal, 6);
  assert.equal(comparison.options[1].savingsVsOneStop, 4);
  assert.equal(comparison.options[1].extraStops, 1);
  assert.equal(comparison.options[1].savingsPerExtraStop, 4);
  assert.equal(comparison.recommended.limit, 2);
  assert.equal(comparison.recommended.actualStops, 2);
});

test("extra-stop estimates can make one supermarket the practical recommendation", () => {
  const comparison = calculateStopComparison(basket, products, retailers, 5);

  assert.equal(comparison.options[1].estimatedExtraCost, 5);
  assert.equal(comparison.options[1].effectiveTotal, 11);
  assert.equal(comparison.options[1].netSavingsVsOneStop, -1);
  assert.equal(comparison.recommended.limit, 1);
});

test("recommends the first complete multi-stop plan when one stop cannot cover the basket", () => {
  const splitProducts = [
    { id: "one", name: "One", prices: { a: 3 } },
    { id: "two", name: "Two", prices: { b: 4 } },
  ];
  const comparison = calculateStopComparison(basket, splitProducts, retailers, 2);

  assert.equal(comparison.oneStopTotal, null);
  assert.equal(comparison.options[0].isComplete, false);
  assert.equal(comparison.options[1].isComplete, true);
  assert.equal(comparison.recommended.limit, 2);
});

test("only supported saved estimates are accepted", () => {
  assert.equal(normalizeExtraStopCost("5"), 5);
  assert.equal(normalizeExtraStopCost("7"), 0);
  assert.equal(normalizeExtraStopCost(null), 0);
});
