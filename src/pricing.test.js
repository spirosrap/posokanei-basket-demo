import assert from "node:assert/strict";
import test from "node:test";
import { getBestProductPrice } from "./pricing.js";

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
