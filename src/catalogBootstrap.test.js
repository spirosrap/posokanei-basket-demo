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
