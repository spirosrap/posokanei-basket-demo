import assert from "node:assert/strict";
import test from "node:test";
import {
  loadPriceWatches,
  MAX_PRICE_WATCHES,
  parsePriceWatches,
  persistPriceWatches,
  PRICE_WATCHES_KEY,
  priceWatchTargetStatus,
  removePriceWatch,
  upsertPriceWatch,
} from "./priceWatch.js";

test("price watches persist only product IDs, optional targets, and timestamps", () => {
  const watches = upsertPriceWatch(
    [],
    { productId: "coffee-1", targetPrice: 3.456, name: "Not stored", currentPrice: 9 },
    { now: "2026-07-26T08:00:00.000Z" },
  );

  assert.deepEqual(watches, [{
    productId: "coffee-1",
    targetPrice: 3.46,
    createdAt: "2026-07-26T08:00:00.000Z",
    updatedAt: "2026-07-26T08:00:00.000Z",
  }]);
  assert.equal("name" in watches[0], false);
  assert.equal("currentPrice" in watches[0], false);
});

test("updating a target preserves the original creation time", () => {
  const first = upsertPriceWatch(
    [],
    { productId: "coffee-1" },
    { now: "2026-07-26T08:00:00.000Z" },
  );
  const updated = upsertPriceWatch(
    first,
    { productId: "coffee-1", targetPrice: 4.2 },
    { now: "2026-07-26T09:00:00.000Z" },
  );

  assert.equal(updated.length, 1);
  assert.equal(updated[0].targetPrice, 4.2);
  assert.equal(updated[0].createdAt, "2026-07-26T08:00:00.000Z");
  assert.equal(updated[0].updatedAt, "2026-07-26T09:00:00.000Z");
});

test("stored watchlists discard corrupt, duplicate, and private extra data", () => {
  const parsed = parsePriceWatches({
    version: 1,
    watches: [
      {
        productId: "coffee-1",
        targetPrice: 5,
        createdAt: "2026-07-26T07:00:00.000Z",
        updatedAt: "2026-07-26T08:00:00.000Z",
        location: { lat: 40 },
        price: 9,
      },
      {
        productId: "coffee-1",
        targetPrice: 4,
        createdAt: "2026-07-26T07:00:00.000Z",
        updatedAt: "2026-07-26T09:00:00.000Z",
      },
      { productId: "broken id", targetPrice: -1 },
    ],
  });

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].targetPrice, 4);
  assert.equal("location" in parsed[0], false);
  assert.equal("price" in parsed[0], false);
});

test("price watches persist, cap the list, and support removal", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  let watches = [];
  for (let index = 0; index < MAX_PRICE_WATCHES + 2; index += 1) {
    watches = upsertPriceWatch(
      watches,
      { productId: `product-${index}` },
      { now: new Date(Date.UTC(2026, 6, 1, index)).toISOString() },
    );
  }

  assert.equal(watches.length, MAX_PRICE_WATCHES);
  persistPriceWatches(watches, storage);
  assert.match(values.get(PRICE_WATCHES_KEY), /"version":1/u);
  assert.deepEqual(loadPriceWatches(storage), watches);
  assert.equal(removePriceWatch(watches, watches[0].productId).length, MAX_PRICE_WATCHES - 1);
});

test("target status distinguishes reached, above, missing, and target-free products", () => {
  assert.deepEqual(
    priceWatchTargetStatus({ targetPrice: null }, 4),
    { status: "no-target", difference: null },
  );
  assert.deepEqual(
    priceWatchTargetStatus({ targetPrice: 4 }, 3.5),
    { status: "met", difference: 0.5 },
  );
  assert.deepEqual(
    priceWatchTargetStatus({ targetPrice: 4 }, 5.25),
    { status: "above", difference: 1.25 },
  );
  assert.deepEqual(
    priceWatchTargetStatus({ targetPrice: 4 }, null),
    { status: "unavailable", difference: null },
  );
});

test("invalid targets and disabled storage surface errors", () => {
  assert.throws(
    () => upsertPriceWatch([], { productId: "coffee-1", targetPrice: 0 }),
    /invalid_price_watch_target/u,
  );
  assert.throws(
    () => persistPriceWatches([], { setItem: () => { throw new Error("disabled"); } }),
    /disabled/u,
  );
});
