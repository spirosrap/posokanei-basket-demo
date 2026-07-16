import test from "node:test";
import assert from "node:assert/strict";
import { createCatalogBootstrap } from "../scripts/catalog-bootstrap.mjs";
import { DEFAULT_DEMO_PRODUCT_IDS } from "./demoBasket.js";

test("static bootstrap keeps first pages and available demo products", () => {
  const products = [
    ...DEFAULT_DEMO_PRODUCT_IDS.slice(0, 2).map((id, index) => ({
      id,
      name: `Demo ${index}`,
      min_price: 20 + index,
      min_unit_price: 10 + index,
    })),
    { id: "cheap", name: "Cheap", min_price: 1, min_unit_price: 5 },
    { id: "unit", name: "Unit", min_price: 3, min_unit_price: 1 },
  ];
  const bootstrap = createCatalogBootstrap({
    generated_at: "2026-07-16T12:00:00.000Z",
    source: "test",
    stats: { active_products: products.length },
    categories: [],
    retailers: [],
    products,
  }, 2);

  assert.deepEqual(bootstrap.pages.price, ["cheap", "unit"]);
  assert.equal(bootstrap.pages.unit_price[0], "unit");
  assert.equal(bootstrap.products.some((product) => product.id === DEFAULT_DEMO_PRODUCT_IDS[0]), true);
  assert.equal(bootstrap.total_products, products.length);
});

test("static bootstrap strips unused catalogue metadata", () => {
  const categories = Array.from({ length: 90 }, (_, index) => ({
    category_id: `category-${index}`,
    category_name: `Category ${index}`,
    product_count: index + 1,
    image_url: "https://example.com/category.png",
    parent_id: "unused-parent",
  }));
  const bootstrap = createCatalogBootstrap({
    generated_at: "2026-07-16T12:00:00.000Z",
    source: "test",
    stats: {
      active_products: 1,
      retailer_count: 2,
      products_on_discount: 1,
      timestamp: "2026-07-16T12:00:00.000Z",
      unused: "large metadata",
    },
    categories,
    retailers: [
      { id: "greek", name: "Greek", country: "GR", logo_url: "/logo" },
      { id: "foreign", name: "Foreign", country: "IT" },
    ],
    products: [{ id: "one", name: "One", min_price: 1, min_unit_price: 1 }],
  }, 1);

  assert.equal(bootstrap.categories.length, 80);
  assert.deepEqual(Object.keys(bootstrap.categories[0]).sort(), [
    "category_id",
    "category_name",
    "product_count",
  ]);
  assert.deepEqual(bootstrap.retailers.map((retailer) => retailer.id), ["greek"]);
  assert.equal("unused" in bootstrap.stats, false);
});
