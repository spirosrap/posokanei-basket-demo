import assert from "node:assert/strict";
import test from "node:test";
import {
  annotatePriceChanges,
  isNotablePriceChange,
} from "../scripts/price-change-history.mjs";

function snapshot(generatedAt, price, priceChange = undefined) {
  return {
    generated_at: generatedAt,
    products: [
      {
        id: "product-1",
        retailer_prices: [
          {
            retailer: "chain-a",
            country: "GR",
            price,
            ...(priceChange ? { price_change: priceChange } : {}),
          },
        ],
      },
    ],
  };
}

test("notable price changes require a meaningful euro or percentage difference", () => {
  assert.equal(isNotablePriceChange(2, 1.8), true);
  assert.equal(isNotablePriceChange(20, 19.5), true);
  assert.equal(isNotablePriceChange(2, 1.95), false);
  assert.equal(isNotablePriceChange(20, 19.8), false);
});

test("snapshot comparison records a notable retailer price decrease", () => {
  const previous = snapshot("2026-07-16T09:00:00.000Z", 2);
  const current = snapshot("2026-07-16T10:00:00.000Z", 1.8);
  const result = annotatePriceChanges(current, previous);
  const change = result.snapshot.products[0].retailer_prices[0].price_change;

  assert.deepEqual(change, {
    previous_price: 2,
    amount: -0.2,
    percentage: -10,
    changed_at: "2026-07-16T10:00:00.000Z",
    compared_at: "2026-07-16T09:00:00.000Z",
  });
  assert.equal(result.stats.new_changes, 1);
  assert.equal(result.stats.decreases, 1);
  assert.equal(result.stats.products_with_recent_changes, 1);
});

test("an unchanged price retains a recent marker but expires it after seven days", () => {
  const marker = {
    previous_price: 2,
    amount: -0.2,
    percentage: -10,
    changed_at: "2026-07-10T10:00:00.000Z",
    compared_at: "2026-07-10T09:00:00.000Z",
  };
  const previous = snapshot("2026-07-11T10:00:00.000Z", 1.8, marker);
  const retained = annotatePriceChanges(
    snapshot("2026-07-16T10:00:00.000Z", 1.8),
    previous,
  );
  const expired = annotatePriceChanges(
    snapshot("2026-07-18T10:01:00.000Z", 1.8),
    previous,
  );

  assert.deepEqual(retained.snapshot.products[0].retailer_prices[0].price_change, marker);
  assert.equal(retained.stats.new_changes, 0);
  assert.equal(expired.snapshot.products[0].retailer_prices[0].price_change, undefined);
});

test("a later small price adjustment clears a marker that no longer describes the price", () => {
  const marker = {
    previous_price: 2,
    amount: -0.2,
    percentage: -10,
    changed_at: "2026-07-16T10:00:00.000Z",
  };
  const previous = snapshot("2026-07-16T10:00:00.000Z", 1.8, marker);
  const result = annotatePriceChanges(
    snapshot("2026-07-16T11:00:00.000Z", 1.85),
    previous,
  );

  assert.equal(result.snapshot.products[0].retailer_prices[0].price_change, undefined);
  assert.equal(result.stats.active_offers, 0);
});
