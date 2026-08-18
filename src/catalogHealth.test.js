import assert from "node:assert/strict";
import test from "node:test";
import { buildCatalogHealthSnapshot } from "../scripts/catalog-health.mjs";
import { coverageDelta, coverageRows, normalizeCatalogHealth } from "./catalogHealth.js";

function snapshot({ generatedAt, products }) {
  return {
    generated_at: generatedAt,
    source: "https://example.test",
    categories: [{ id: "food", name: "Τρόφιμα", depth: 0 }],
    retailers: [
      { id: "one", name: "One" },
      { id: "two", name: "Two" },
    ],
    coverage: {
      root_categories: [{ category_id: "food", category_name: "Τρόφιμα", product_count: products.length }],
    },
    products,
  };
}

test("catalogue health captures current and previous publication coverage", () => {
  const previous = snapshot({
    generatedAt: "2026-08-18T10:00:00.000Z",
    products: [
      { id: "a", retailer_prices: [{ retailer: "one", country: "GR" }] },
    ],
  });
  const current = snapshot({
    generatedAt: "2026-08-18T11:00:00.000Z",
    products: [
      { id: "a", retailer_prices: [{ retailer: "one", country: "GR" }] },
      { id: "b", retailer_prices: [{ retailer: "one", country: "GR" }, { retailer: "two", country: "GR" }] },
    ],
  });

  const health = buildCatalogHealthSnapshot({ currentSnapshot: current, previousSnapshot: previous });
  assert.equal(health.current.product_count, 2);
  assert.equal(health.current.total_offers, 3);
  assert.equal(health.current.retailers.length, 2);
  assert.equal(health.previous.product_count, 1);
});

test("catalogue health normalization and row deltas are stable", () => {
  const health = normalizeCatalogHealth({
    schema_version: 1,
    generated_at: "2026-08-18T11:00:00.000Z",
    current: {
      generated_at: "2026-08-18T11:00:00.000Z",
      product_count: 101,
      category_count: 9,
      total_offers: 205,
      retailers: [{ id: "one", name: "One", product_count: 80 }],
    },
    previous: {
      generated_at: "2026-08-18T10:00:00.000Z",
      product_count: 100,
      category_count: 9,
      total_offers: 200,
      retailers: [
        { id: "one", name: "One", product_count: 75 },
        { id: "gone", name: "Gone", product_count: 12 },
      ],
    },
  });

  assert.equal(health.current.productCount, 101);
  assert.deepEqual(coverageDelta(101, 100), { value: 1, ratio: 0.01 });
  const rows = coverageRows(health.current.retailers, health.previous.retailers);
  assert.equal(rows[0].delta.value, 5);
  assert.deepEqual(rows[1], {
    id: "gone",
    name: "Gone",
    productCount: 0,
    delta: { value: -12, ratio: -1 },
  });
});
