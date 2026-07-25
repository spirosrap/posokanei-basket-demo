import assert from "node:assert/strict";
import test from "node:test";
import {
  filterPriceChanges,
  normalizePriceChangesPayload,
  priceChangeRetailers,
  priceHistoryForProduct,
} from "./priceChangesView.js";

const payload = {
  schema_version: 1,
  generated_at: "2026-07-17T12:00:00.000Z",
  retention_days: 7,
  stats: { catalog_products: 9000 },
  histories: {
    coffee: {
      product_id: "coffee",
      product_name: "Ελληνικός Καφές",
      image_url: "https://example.com/coffee.jpg",
      retailers: [
        {
          retailer_id: "chain-b",
          retailer_name: "Αλυσίδα Β",
          points: [
            ["2026-07-17T10:00:00.000Z", 4],
            ["2026-07-17T11:00:00.000Z", 3.5],
          ],
        },
      ],
    },
  },
  changes: [
    {
      product_id: "coffee",
      product_name: "Ελληνικός Καφές",
      brand: "Μάρκα",
      category: "Καφές",
      image_url: "https://example.com/coffee.jpg",
      retailer_id: "chain-b",
      retailer_name: "Αλυσίδα Β",
      previous_price: 4,
      current_price: 3.5,
      amount: -0.5,
      percentage: -12.5,
      direction: "decrease",
      changed_at: "2026-07-17T11:00:00.000Z",
    },
    {
      product_id: "milk",
      product_name: "Γάλα",
      brand: "Brand",
      category: "Γαλακτοκομικά",
      retailer_id: "chain-a",
      retailer_name: "Αλυσίδα Α",
      previous_price: 2,
      current_price: 2.2,
      amount: 0.2,
      percentage: 10,
      direction: "increase",
      changed_at: "2026-07-17T09:00:00.000Z",
    },
  ],
};

test("price-change view payload is validated and summarized", () => {
  const normalized = normalizePriceChangesPayload(payload);

  assert.deepEqual(normalized.stats, {
    changes: 2,
    products: 2,
    retailers: 2,
    decreases: 1,
    increases: 1,
    historyProducts: 1,
  });
  assert.equal(normalized.catalogProducts, 9000);
  assert.deepEqual(priceChangeRetailers(normalized.changes), [
    { id: "chain-a", name: "Αλυσίδα Α" },
    { id: "chain-b", name: "Αλυσίδα Β" },
  ]);
  assert.deepEqual(normalized.histories.coffee.retailers[0].points[0], {
    observedAt: "2026-07-17T10:00:00.000Z",
    observedAtMs: Date.parse("2026-07-17T10:00:00.000Z"),
    price: 4,
  });
});

test("price-change view decodes the compact v2 feed", () => {
  const normalized = normalizePriceChangesPayload({
    schema_version: 2,
    generated_at: "2026-07-17T12:00:00.000Z",
    retention_days: 7,
    stats: { catalog_products: 9000 },
    products: {
      coffee: [
        "Ελληνικός Καφές",
        "Μάρκα",
        "Καφές",
        "https://example.com/coffee.jpg",
      ],
    },
    retailers: {
      "chain-b": "Αλυσίδα Β",
    },
    changes: [
      [
        "coffee",
        "chain-b",
        4,
        3.5,
        -0.5,
        -12.5,
        -1,
        "2026-07-17T11:00:00.000Z",
        "2026-07-17T10:00:00.000Z",
        "2026-07-17T11:00:00.000Z",
      ],
    ],
  });

  assert.equal(normalized.changes[0].productName, "Ελληνικός Καφές");
  assert.equal(normalized.changes[0].retailerName, "Αλυσίδα Β");
  assert.equal(normalized.changes[0].direction, "decrease");
  assert.equal(normalized.stats.historyProducts, 0);
  assert.deepEqual(normalized.histories, {});
});

test("price history uses retained series and falls back to the visible change", () => {
  const normalized = normalizePriceChangesPayload(payload);
  const retained = priceHistoryForProduct(
    normalized.histories,
    normalized.changes,
    "coffee",
  );
  const fallback = priceHistoryForProduct(
    {},
    normalized.changes,
    "milk",
  );

  assert.equal(retained.retailers[0].points.length, 2);
  assert.deepEqual(
    fallback.retailers[0].points.map((point) => point.price),
    [2, 2.2],
  );
});

test("price-change filters support accent-insensitive search, chain, and direction", () => {
  const { changes } = normalizePriceChangesPayload(payload);

  assert.deepEqual(
    filterPriceChanges(changes, { query: "ελληνικος" }).map((change) => change.productId),
    ["coffee"],
  );
  assert.deepEqual(
    filterPriceChanges(changes, { retailerId: "chain-a" }).map((change) => change.productId),
    ["milk"],
  );
  assert.deepEqual(
    filterPriceChanges(changes, { direction: "decrease" }).map((change) => change.productId),
    ["coffee"],
  );
});

test("price-change sorting supports absolute movement and product name", () => {
  const { changes } = normalizePriceChangesPayload(payload);

  assert.deepEqual(
    filterPriceChanges(changes, { sort: "amount" }).map((change) => change.productId),
    ["coffee", "milk"],
  );
  assert.deepEqual(
    filterPriceChanges(changes, { sort: "name" }).map((change) => change.productId),
    ["milk", "coffee"],
  );
});

test("price-change payload rejects inconsistent amounts", () => {
  assert.throws(
    () => normalizePriceChangesPayload({
      ...payload,
      changes: [{ ...payload.changes[0], amount: -0.1 }],
    }),
    /invalid_price_change/,
  );
});
