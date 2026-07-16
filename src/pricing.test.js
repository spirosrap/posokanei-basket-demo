import assert from "node:assert/strict";
import test from "node:test";
import {
  getBestProductPrice,
  getBestProductUnitPrice,
  sortProducts,
  sortProductsByBestPrice,
} from "./pricing.js";

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

test("unit-price sorting compares equal units instead of package totals", () => {
  const products = [
    {
      id: "small",
      name: "Small",
      prices: { lidl: 1.2 },
      unitAmount: 0.2,
      unitPrices: { lidl: 6 },
    },
    {
      id: "large",
      name: "Large",
      prices: { lidl: 3 },
      unitAmount: 1,
      unitPrices: { lidl: 3 },
    },
    { id: "unknown", name: "Unknown", prices: { lidl: 0.8 } },
  ];

  assert.deepEqual(getBestProductUnitPrice(products[1], ["lidl"]), {
    retailerId: "lidl",
    price: 3,
    unitPrice: 3,
  });
  assert.deepEqual(
    sortProducts(products, "unit_price", ["lidl"]).map((item) => item.id),
    ["large", "small", "unknown"],
  );
  assert.deepEqual(
    sortProducts(products, "price", ["lidl"]).map((item) => item.id),
    ["unknown", "small", "large"],
  );
});
