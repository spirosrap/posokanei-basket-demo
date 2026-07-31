import assert from "node:assert/strict";
import test from "node:test";
import {
  loadShoppingBudget,
  normalizeShoppingBudget,
  persistShoppingBudget,
  shoppingBudgetStatus,
  SHOPPING_BUDGET_KEY,
} from "./shoppingBudget.js";

test("normalizes valid shopping budgets", () => {
  assert.equal(normalizeShoppingBudget("80,55"), 80.55);
  assert.equal(normalizeShoppingBudget(0), null);
  assert.equal(normalizeShoppingBudget("invalid"), null);
});

test("classifies totals against the shopping budget", () => {
  assert.equal(shoppingBudgetStatus(null, 100).state, "unset");
  assert.equal(shoppingBudgetStatus(60, 100).state, "under");
  assert.equal(shoppingBudgetStatus(95, 100).state, "near");
  assert.deepEqual(shoppingBudgetStatus(105.5, 100), {
    state: "over",
    budget: 100,
    total: 105.5,
    difference: -5.5,
    progress: 100,
  });
});

test("persists and clears the shopping budget", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  persistShoppingBudget("75,25", storage);
  assert.equal(values.get(SHOPPING_BUDGET_KEY), "75.25");
  assert.equal(loadShoppingBudget(storage), 75.25);
  persistShoppingBudget(null, storage);
  assert.equal(values.has(SHOPPING_BUDGET_KEY), false);
});
