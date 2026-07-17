import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProduct } from "./posokaneiApi.js";

test("catalogue normalization keeps validated retailer price changes", () => {
  const product = normalizeProduct({
    id: "product-1",
    name: "Product",
    unit: "kg",
    unit_quantity: 1,
    retailer_prices: [
      {
        retailer: "lidl",
        price: 1.8,
        price_change: {
          previous_price: 2,
          amount: -0.2,
          percentage: -10,
          changed_at: "2026-07-17T08:00:00.000Z",
          compared_at: "2026-07-17T07:00:00.000Z",
        },
      },
    ],
  }, "snapshot");

  assert.deepEqual(product.priceChanges.lidl, {
    previousPrice: 2,
    amount: -0.2,
    percentage: -10,
    changedAt: "2026-07-17T08:00:00.000Z",
    comparedAt: "2026-07-17T07:00:00.000Z",
  });
});

test("catalogue normalization rejects price changes that do not match the current price", () => {
  const product = normalizeProduct({
    id: "product-1",
    name: "Product",
    retailer_prices: [
      {
        retailer: "lidl",
        price: 1.5,
        price_change: {
          previous_price: 2,
          amount: -0.2,
          percentage: -10,
          changed_at: "2026-07-17T08:00:00.000Z",
        },
      },
    ],
  });

  assert.deepEqual(product.priceChanges, {});
});
