import test from "node:test";
import assert from "node:assert/strict";
import { filterBasket } from "./basketView.js";

const basket = [{ productId: "milk", quantity: 2 }, { productId: "bread", quantity: 1 }];
const products = new Map([
  ["milk", { name: "Γάλα Πλήρες", brand: "ΟΛΥΜΠΟΣ", gtin: "123456" }],
  ["bread", { name: "Ψωμί" }],
]);
const assignments = new Map([["milk", { price: 2 }]]);

test("basket search ignores accents and case and matches all words, brands and barcodes", () => {
  for (const query of ["γαλα", "ΓΑΛΑ πληρες", "ολυμπος", "123456", "  πληρες   γαλα  "]) {
    assert.deepEqual(filterBasket(basket, products, assignments, query, false), [basket[0]]);
  }
  assert.deepEqual(filterBasket(basket, products, assignments, "γάλα ψωμί", false), []);
});

test("outside-plan and search filters intersect without mutating basket or assignments", () => {
  assert.deepEqual(filterBasket(basket, products, assignments, "", true), [basket[1]]);
  assert.deepEqual(filterBasket(basket, products, assignments, "γάλα", true), []);
  assert.deepEqual(filterBasket(basket, products, new Map(), "", true), basket);
  assert.deepEqual(filterBasket(basket, products, assignments, "", false), basket);
  assert.equal(basket.length, 2);
  assert.equal(assignments.size, 1);
  assert.deepEqual(filterBasket([...basket, { productId: "missing" }], products, assignments, "", false), basket);
});
