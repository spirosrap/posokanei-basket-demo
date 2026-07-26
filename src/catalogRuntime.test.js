import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeCatalog } from "../scripts/catalog-runtime.mjs";
import { normalizeProduct } from "./posokaneiApi.js";

test("runtime catalogue keeps shopping fields and removes unused payload", () => {
  const runtime = createRuntimeCatalog({
    generated_at: "2026-07-16T12:00:00.000Z",
    source: "https://api.posokanei.gov.gr",
    stats: { total_products: 1 },
    categories: [],
    retailers: [],
    products: [
      {
        id: "product-1",
        name: "Product",
        brand: "Brand",
        category: "Category",
        category_ids: ["category-1"],
        subcategory: "Subcategory",
        description: "Large description that is not needed at request time",
        has_image: true,
        image_version: "image-v1",
        unit: "kg",
        unit_quantity: 0.5,
        retailer_prices: [
          {
            retailer: "chain-a",
            price: 2.4,
            price_normalized: 4.8,
            country: "GR",
            price_change: {
              previous_price: 3,
              amount: -0.6,
              percentage: -20,
              changed_at: "2026-07-16T11:00:00.000Z",
            },
          },
          { retailer: "chain-b", price: 3, price_normalized: 6, country: "CY" },
        ],
      },
    ],
  });

  assert.equal(runtime.products.length, 1);
  assert.deepEqual(runtime.products[0].retailer_prices, [
    {
      retailer: "chain-a",
      price: 2.4,
      price_change: {
        previous_price: 3,
        amount: -0.6,
        percentage: -20,
        changed_at: "2026-07-16T11:00:00.000Z",
      },
    },
  ]);
  assert.equal(runtime.products[0].min_price, 2.4);
  assert.equal(runtime.products[0].min_unit_price, 4.8);
  assert.equal("price_normalized" in runtime.products[0].retailer_prices[0], false);
  assert.equal(runtime.products[0].image_version, "image-v1");
  assert.equal("description" in runtime.products[0], false);
  assert.equal(normalizeProduct(runtime.products[0], "snapshot").unitPrices["chain-a"], 4.8);
});
