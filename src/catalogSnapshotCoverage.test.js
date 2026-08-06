import test from "node:test";
import assert from "node:assert/strict";
import {
  finalizeCatalogProducts,
  getCatalogRootSegments,
  mergeCatalogProducts,
} from "../scripts/catalog-snapshot-coverage.mjs";

test("catalogue segments merge by product ID and keep the latest record", () => {
  const productsById = new Map();
  assert.equal(mergeCatalogProducts(productsById, [
    { id: "a", name: "Άλφα", price: 1 },
    { id: "b", name: "Βήτα", price: 2 },
  ]), 2);
  assert.equal(mergeCatalogProducts(productsById, [
    { id: "c", name: "Γάμμα", price: 3 },
    { id: "b", name: "Βήτα", price: 2.1 },
  ]), 1);

  const products = finalizeCatalogProducts(productsById, 3);
  assert.deepEqual(products.map((product) => product.id), ["a", "b", "c"]);
  assert.equal(products.find((product) => product.id === "b").price, 2.1);
});

test("catalogue collection uses only named root categories", () => {
  assert.deepEqual(getCatalogRootSegments([
    { category_id: "food", category_name: "Τρόφιμα", depth: 0, product_count: 12 },
    { category_id: "milk", category_name: "Γάλα", depth: 1, product_count: 4 },
    { category_id: "care", category_name: "Φροντίδα", depth: "0", product_count: 3 },
    { category_id: "", category_name: "Invalid", depth: 0, product_count: 1 },
  ]), [
    { id: "care", name: "Φροντίδα", expectedCount: 3 },
    { id: "food", name: "Τρόφιμα", expectedCount: 12 },
  ]);
});

test("catalogue publication is rejected when segmented windows remain incomplete", () => {
  const productsById = new Map([["a", { id: "a", name: "Άλφα" }]]);
  assert.throws(
    () => finalizeCatalogProducts(productsById, 2),
    /Incomplete catalogue: collected 1 of 2 products/,
  );
});
