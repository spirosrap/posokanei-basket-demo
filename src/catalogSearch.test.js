import test from "node:test";
import assert from "node:assert/strict";
import { prepareCatalogSearch, queryCatalogSearch } from "./catalogSearch.js";

const PRODUCTS = [
  { id: "a", name: "Γάλα Φρέσκο", brand: "Alpha", category: "dairy", gtin: "12345678", min_price: 2.2, min_unit_price: 2.2 },
  { id: "b", name: "Γάλα Ελαφρύ", brand: "Beta", category: "dairy", gtin: "87654321", min_price: 1.8, min_unit_price: 1.9 },
  { id: "c", name: "Ψωμί Τοστ", brand: "Alpha", category: "bakery", min_price: 1.4, min_unit_price: 2.8 },
  { id: "d", name: "Ρύζι", brand: "Delta", category_ids: ["pantry"], min_price: 2.7, min_unit_price: 1.2 },
];

test("catalog search filters locally and preserves price ordering", () => {
  const prepared = prepareCatalogSearch(PRODUCTS);
  const result = queryCatalogSearch(prepared, { query: "γάλα", sortMode: "price" });
  assert.deepEqual(result.products.map((product) => product.id), ["b", "a"]);
  assert.equal(result.total, 2);
  assert.equal(result.source, "snapshot-worker");
});

test("catalog search supports categories, unit-price sorting, paging, and barcodes", () => {
  const prepared = prepareCatalogSearch(PRODUCTS);
  const category = queryCatalogSearch(prepared, { categoryId: "pantry", sortMode: "unit_price" });
  assert.deepEqual(category.products.map((product) => product.id), ["d"]);

  const page = queryCatalogSearch(prepared, { page: 2, pageSize: 2, sortMode: "name" });
  assert.equal(page.products.length, 2);
  assert.equal(page.totalPages ?? page.total_pages, 2);
  assert.equal(page.has_next, false);

  const barcode = queryCatalogSearch(prepared, { query: "12345678" });
  assert.deepEqual(barcode.products.map((product) => product.id), ["a"]);
});
