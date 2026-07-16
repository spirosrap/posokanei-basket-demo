import assert from "node:assert/strict";
import test from "node:test";
import {
  BASKET_DATA_SCHEMA,
  BASKET_DATA_VERSION,
  formatBasketData,
  parseBasketData,
} from "./basketData.js";

const basket = [
  { productId: "milk-1", quantity: 2 },
  { productId: "coffee-2", quantity: 1 },
];
const productMap = new Map([
  ["milk-1", { name: "Γάλα 1L" }],
  ["coffee-2", { name: "Καφές 200g" }],
]);

test("machine-readable export is versioned, readable, and round-trips basket settings", () => {
  const text = formatBasketData({
    basket,
    productMap,
    maxChains: 3,
    retailerIds: ["lidl", "sklavenitis"],
    extraStopCost: 5,
    exportedAt: "2026-07-16T12:00:00.000Z",
  });
  const payload = JSON.parse(text);
  assert.equal(payload.schema, BASKET_DATA_SCHEMA);
  assert.equal(payload.version, BASKET_DATA_VERSION);
  assert.equal(payload.exportedAt, "2026-07-16T12:00:00.000Z");
  assert.deepEqual(payload.basket[0], {
    productId: "milk-1",
    quantity: 2,
    name: "Γάλα 1L",
  });
  assert.deepEqual(parseBasketData(text), {
    basket,
    maxChains: 3,
    retailerIds: ["lidl", "sklavenitis"],
    extraStopCost: 5,
  });
});

test("machine-readable import ignores display names and normalizes duplicate IDs", () => {
  const text = JSON.stringify({
    schema: BASKET_DATA_SCHEMA,
    version: BASKET_DATA_VERSION,
    basket: [
      { productId: "milk-1", quantity: 1, name: "Untrusted name" },
      { productId: "milk-1", quantity: 4, name: "Another name" },
    ],
    settings: { maxChains: 2, retailerIds: [], extraStopCost: 2 },
  });
  assert.deepEqual(parseBasketData(text), {
    basket: [{ productId: "milk-1", quantity: 4 }],
    maxChains: 2,
    retailerIds: null,
    extraStopCost: 2,
  });
});

test("machine-readable import rejects incompatible or unsafe payloads", () => {
  assert.throws(() => parseBasketData("{}"), /invalid_schema/u);
  assert.throws(
    () =>
      parseBasketData(JSON.stringify({
        schema: BASKET_DATA_SCHEMA,
        version: 99,
        basket,
      })),
    /unsupported_version/u,
  );
  assert.throws(
    () =>
      parseBasketData(JSON.stringify({
        schema: BASKET_DATA_SCHEMA,
        version: BASKET_DATA_VERSION,
        basket: [{ productId: "bad,id", quantity: 1 }],
      })),
    /invalid_product_id/u,
  );
  assert.throws(
    () =>
      parseBasketData(JSON.stringify({
        schema: BASKET_DATA_SCHEMA,
        version: BASKET_DATA_VERSION,
        basket: [{ productId: "milk-1", quantity: 0.5 }],
      })),
    /invalid_quantity/u,
  );
});

test("machine-readable import accepts UTF-8 BOM files", () => {
  const text = formatBasketData({
    basket,
    productMap,
    maxChains: 1,
    retailerIds: null,
    extraStopCost: 0,
  });
  assert.equal(parseBasketData(`\uFEFF${text}`).basket.length, 2);
});
