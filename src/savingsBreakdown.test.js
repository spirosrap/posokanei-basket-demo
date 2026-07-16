import assert from "node:assert/strict";
import test from "node:test";
import { calculateSavingsBreakdown } from "./savingsBreakdown.js";

const products = [
  { id: "coffee", name: "Coffee" },
  { id: "milk", name: "Milk" },
  { id: "pasta", name: "Pasta" },
];

const oneStopRanking = {
  isComplete: true,
  retailer: { id: "one", name: "One Market" },
  total: 19,
  items: [
    { product: products[0], quantity: 1, lineTotal: 10 },
    { product: products[1], quantity: 1, lineTotal: 5 },
    { product: products[2], quantity: 1, lineTotal: 4 },
  ],
};

const splitPlan = {
  isComplete: true,
  total: 14,
  groups: [
    {
      retailer: { id: "two", name: "Two Market" },
      items: [
        { product: products[0], quantity: 1, lineTotal: 7 },
        { product: products[1], quantity: 1, lineTotal: 6 },
      ],
    },
    {
      retailer: { id: "three", name: "Three Market" },
      items: [{ product: products[2], quantity: 1, lineTotal: 1 }],
    },
  ],
};

test("explains net plan savings with positive contributors and tradeoffs", () => {
  const breakdown = calculateSavingsBreakdown(splitPlan, oneStopRanking, 1);

  assert.equal(breakdown.totalSavings, 5);
  assert.equal(breakdown.grossSavings, 6);
  assert.equal(breakdown.tradeoffCost, 1);
  assert.equal(breakdown.savingItemCount, 2);
  assert.equal(breakdown.tradeoffItemCount, 1);
  assert.equal(breakdown.visibleItems[0].product.id, "coffee");
  assert.equal(breakdown.remainingItemCount, 1);
  assert.equal(breakdown.remainingSavings, 3);
});

test("omits a breakdown when there is no complete one-stop comparison", () => {
  assert.equal(calculateSavingsBreakdown(splitPlan, null), null);
  assert.equal(
    calculateSavingsBreakdown({ ...splitPlan, isComplete: false }, oneStopRanking),
    null,
  );
});
