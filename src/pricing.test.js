import assert from "node:assert/strict";
import test from "node:test";
import { getBestProductPrice, sortProductsByBestPrice } from "./pricing.js";

const product = {
  prices: {
    halkiadakis: 1.5,
    masoutis: 2,
    sklavenitis: 2.5,
  },
};

test("best product price can be limited to location-eligible retailers", () => {
  assert.deepEqual(getBestProductPrice(product), {
    retailerId: "halkiadakis",
    price: 1.5,
  });
  assert.deepEqual(getBestProductPrice(product, ["masoutis", "sklavenitis"]), {
    retailerId: "masoutis",
    price: 2,
  });
  assert.equal(getBestProductPrice(product, []), null);
});

test("search products sort by the best eligible price and put unavailable items last", () => {
  const products = [
    { id: "third", name: "Third", prices: { lidl: 3, masoutis: 1 } },
    { id: "missing", name: "Missing", prices: { masoutis: 0.5 } },
    { id: "first", name: "First", prices: { lidl: 1 } },
    { id: "second", name: "Second", prices: { lidl: 2 } },
  ];

  assert.deepEqual(
    sortProductsByBestPrice(products, ["lidl"]).map((item) => item.id),
    ["first", "second", "third", "missing"],
  );
});
