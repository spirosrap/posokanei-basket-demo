import assert from "node:assert/strict";
import test from "node:test";
import {
  getInitialProductSort,
  normalizeProductSort,
  productSortApiValue,
  saveProductSort,
} from "./productSort.js";

test("product sorting accepts only supported modes", () => {
  assert.equal(normalizeProductSort("price"), "price");
  assert.equal(normalizeProductSort("unit_price"), "unit_price");
  assert.equal(normalizeProductSort("name"), "name");
  assert.equal(normalizeProductSort("discount"), "price");
});

test("product sorting persists safely and maps to API values", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.equal(getInitialProductSort(storage), "price");
  assert.equal(saveProductSort("unit_price", storage), "unit_price");
  assert.equal(getInitialProductSort(storage), "unit_price");
  assert.equal(productSortApiValue("price"), "price_asc");
  assert.equal(productSortApiValue("unit_price"), "unit_price");
});
