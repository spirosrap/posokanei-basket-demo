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
  { productId: "snapshot-abc123", quantity: 0.5 },
];

test("shared baskets preserve product IDs, quantities, and stop count", () => {
  const decoded = decodeSharedBasket(encodeSharedBasket(basket, 3));
  assert.deepEqual(decoded, { basket, maxChains: 3 });
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
  });
});

test("invalid and unsupported shared baskets are rejected", () => {
  assert.deepEqual(
    readSharedBasketUrl("https://example.com/?basket=not-valid-json"),
    { status: "invalid", basket: [], maxChains: 1 },
  );
  assert.throws(() => encodeSharedBasket([{ productId: "bad,id", quantity: 1 }], 1));
  assert.throws(() => encodeSharedBasket(basket, 5));
});

