import assert from "node:assert/strict";
import test from "node:test";
import { createProductDetailRecords } from "../scripts/catalog-details.mjs";

test("product-detail sidecar keeps descriptions and compact retailer history", () => {
  const records = createProductDetailRecords({
    products: [
      {
        id: "product-1",
        gtin: "5200000000001",
        name: "Product",
        brand: "Brand",
        description: "Full catalogue description.",
        category: "Category",
        unit: "kg",
        unit_quantity: 0.5,
        image_url: "https://example.com/product.jpg",
        retailer_prices: [
          {
            retailer: "chain-a",
            retailer_display_name: "Chain A",
            price: 2.5,
            price_normalized: 5,
            last_updated: "2026-07-25T10:00:00.000Z",
            price_change: { previous_price: 3, amount: -0.5 },
            price_history: [
              ["2026-07-24T10:00:00.000Z", 3],
              ["2026-07-25T10:00:00.000Z", 2.5],
            ],
            unused: "removed",
          },
        ],
        unused: "removed",
      },
    ],
  });

  assert.deepEqual(records, [
    {
      id: "product-1",
      gtin: "5200000000001",
      name: "Product",
      brand: "Brand",
      category: "Category",
      category_ids: [],
      unit: "kg",
      unit_quantity: 0.5,
      image_url: "https://example.com/product.jpg",
      has_image: false,
      image_version: "",
      description: "Full catalogue description.",
      retailer_prices: [
        {
          retailer: "chain-a",
          retailer_display_name: "Chain A",
          price: 2.5,
          price_normalized: 5,
          last_updated: "2026-07-25T10:00:00.000Z",
          price_change: { previous_price: 3, amount: -0.5 },
          price_history: [
            ["2026-07-24T10:00:00.000Z", 3],
            ["2026-07-25T10:00:00.000Z", 2.5],
          ],
        },
      ],
    },
  ]);
});
