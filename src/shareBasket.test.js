import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSharedBasketUrl,
  decodeSharedBasket,
  encodeSharedBasket,
  readSharedBasketUrl,
} from "./shareBasket.js";

const basket = [
  { productId: "1234567890123", quantity: 2 },
  { productId: "snapshot-abc123", quantity: 1 },
];

test("shared baskets preserve product IDs, quantities, and stop count", () => {
  const decoded = decodeSharedBasket(encodeSharedBasket(basket, 3));
  assert.deepEqual(decoded, { basket, maxChains: 3, retailerIds: null });
});

test("shared baskets preserve an explicit supermarket selection", () => {
  const retailerIds = ["lidl", "sklavenitis", "ab_vasilopoulos"];
  const decoded = decodeSharedBasket(encodeSharedBasket(basket, 2, retailerIds));
  assert.deepEqual(decoded, { basket, maxChains: 2, retailerIds });
});

test("version 1 links remain compatible and default to all supermarkets", () => {
  const legacyPayload = btoa(JSON.stringify({
    v: 1,
    s: 3,
    i: basket.map(({ productId, quantity }) => [productId, quantity]),
  })).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
  assert.deepEqual(decodeSharedBasket(legacyPayload), {
    basket,
    maxChains: 3,
    retailerIds: null,
  });
});

test("legacy fractional quantities are normalized to whole products", () => {
  const legacyPayload = btoa(JSON.stringify({
    v: 1,
    s: 1,
    i: [["snapshot-abc123", 0.5], ["1234567890123", 2.6]],
  })).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");

  assert.deepEqual(decodeSharedBasket(legacyPayload).basket, [
    { productId: "snapshot-abc123", quantity: 1 },
    { productId: "1234567890123", quantity: 3 },
  ]);
});

test("shared basket URLs use a single compact basket parameter", () => {
  const sharedUrl = buildSharedBasketUrl(
    "https://agenticspiros.com/demo/posokanei-basket/?old=1#plan",
    basket,
    4,
  );
  const url = new URL(sharedUrl);
  assert.equal(url.searchParams.size, 1);
  assert.equal(url.hash, "");
  assert.deepEqual(readSharedBasketUrl(sharedUrl), {
    status: "valid",
    basket,
    maxChains: 4,
    retailerIds: null,
  });
});

test("invalid and unsupported shared baskets are rejected", () => {
  assert.deepEqual(
    readSharedBasketUrl("https://example.com/?basket=not-valid-json"),
    { status: "invalid", basket: [], maxChains: 1, retailerIds: null },
  );
  assert.throws(() => encodeSharedBasket([{ productId: "bad,id", quantity: 1 }], 1));
  assert.throws(() => encodeSharedBasket(basket, 5));
  assert.throws(() => encodeSharedBasket(basket, 1, []));
});
