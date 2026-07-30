import assert from "node:assert/strict";
import test from "node:test";
import { calculateStopComparison } from "./stopComparison.js";
import { buildStopReductionInsight } from "./stopReduction.js";

const retailers = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
  { id: "c", name: "C" },
];

test("identifies the exact products preventing the nearest lower-stop plan", () => {
  const products = [
    { id: "one", name: "One", prices: { a: 1 } },
    { id: "two", name: "Two", prices: { b: 1 } },
    { id: "three", name: "Three", prices: { c: 1 } },
  ];
  const basket = products.map((product) => ({ productId: product.id, quantity: 1 }));
  const insight = buildStopReductionInsight(
    calculateStopComparison(basket, products, retailers, 0),
  );

  assert.equal(insight.requiredStops, 3);
  assert.equal(insight.targetLimit, 2);
  assert.equal(insight.coveredCount, 2);
  assert.equal(insight.totalCount, 3);
  assert.deepEqual(insight.targetRetailerIds, ["a", "b"]);
  assert.deepEqual(insight.missingItems.map((item) => item.product.id), ["three"]);
});

test("does not show stop-reduction guidance when one chain already covers the basket", () => {
  const products = [
    { id: "one", name: "One", prices: { a: 1, b: 2 } },
    { id: "two", name: "Two", prices: { a: 2, c: 1 } },
  ];
  const basket = products.map((product) => ({ productId: product.id, quantity: 1 }));

  assert.equal(
    buildStopReductionInsight(calculateStopComparison(basket, products, retailers, 0)),
    null,
  );
});

test("does not claim a lower-stop path without a usable target retailer set", () => {
  assert.equal(
    buildStopReductionInsight({
      options: [
        {
          isComplete: false,
          limit: 1,
          plan: {
            availableCount: 0,
            retailers: [],
            missingItems: [{ product: { id: "one" }, quantity: 1 }],
          },
        },
        { isComplete: true, limit: 2, actualStops: 2 },
      ],
    }),
    null,
  );
});
