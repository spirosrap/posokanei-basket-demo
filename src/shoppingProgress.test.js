import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRemainingShoppingPlan,
  buildShoppingPlanId,
  loadShoppingProgress,
  saveShoppingProgress,
  shoppingItemId,
  summarizeShoppingPlan,
} from "./shoppingProgress.js";

const plan = {
  isComplete: true,
  groups: [
    {
      retailer: { id: "masoutis" },
      items: [
        { product: { id: "milk" }, quantity: 2, lineTotal: 4.4 },
        { product: { id: "coffee" }, quantity: 1, lineTotal: 3 },
      ],
    },
    {
      retailer: { id: "lidl" },
      items: [{ product: { id: "yogurt" }, quantity: 2, lineTotal: 5.6 }],
    },
  ],
};

test("shopping plan IDs change with retailer assignments or quantities", () => {
  const planId = buildShoppingPlanId(plan);
  assert.match(planId, /masoutis:coffee:1,milk:2/);
  assert.notEqual(
    planId,
    buildShoppingPlanId({
      ...plan,
      groups: [{ ...plan.groups[0], items: [{ product: { id: "milk" }, quantity: 3 }] }],
    }),
  );
  assert.equal(buildShoppingPlanId({ ...plan, isComplete: false }), "");
});

test("shopping item IDs include both the chain and product", () => {
  assert.equal(shoppingItemId("masoutis", "milk"), "masoutis:milk");
});

test("shopping summaries report remaining items, chains, and spend", () => {
  const summary = summarizeShoppingPlan(plan, ["masoutis:milk", "unknown:item"]);

  assert.equal(summary.completedCount, 1);
  assert.equal(summary.totalCount, 3);
  assert.equal(summary.remainingTotal, 8.6);
  assert.equal(summary.isComplete, false);
  assert.deepEqual(summary.groups[0].remainingItems.map((item) => item.product.id), ["coffee"]);
  assert.equal(summary.groups[0].completedCount, 1);
});

test("remaining shopping plans exclude completed supermarket stops", () => {
  const summary = summarizeShoppingPlan(plan, ["masoutis:milk", "masoutis:coffee"]);
  const remainingPlan = buildRemainingShoppingPlan(plan, summary);

  assert.deepEqual(remainingPlan.groups.map((group) => group.retailer.id), ["lidl"]);
  assert.equal(remainingPlan.chainCount, 1);
  assert.equal(remainingPlan.total, 5.6);
  assert.equal(
    buildRemainingShoppingPlan(
      plan,
      summarizeShoppingPlan(plan, ["masoutis:milk", "masoutis:coffee", "lidl:yogurt"]),
    ),
    null,
  );
});

test("shopping progress persists only for the matching plan", () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };

  const planId = buildShoppingPlanId(plan);
  saveShoppingProgress(planId, ["masoutis:milk", "masoutis:milk"]);

  assert.deepEqual(loadShoppingProgress(planId), ["masoutis:milk"]);
  assert.deepEqual(loadShoppingProgress(`${planId}:changed`), []);
  delete globalThis.localStorage;
});
