import assert from "node:assert/strict";
import test from "node:test";
import {
  buildShoppingPlanId,
  loadShoppingProgress,
  saveShoppingProgress,
  shoppingItemId,
} from "./shoppingProgress.js";

const plan = {
  isComplete: true,
  groups: [
    {
      retailer: { id: "masoutis" },
      items: [
        { product: { id: "milk" }, quantity: 2 },
        { product: { id: "coffee" }, quantity: 1 },
      ],
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
