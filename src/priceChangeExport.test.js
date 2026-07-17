import assert from "node:assert/strict";
import test from "node:test";
import {
  createPriceChangesCsv,
  createPriceChangesPayload,
  inspectPriceChangesCsv,
  inspectPriceChangesJson,
} from "../scripts/price-change-export.mjs";

function snapshot() {
  return {
    generated_at: "2026-07-17T12:00:00.000Z",
    retailers: [
      { id: "chain-a", name: "Αλυσίδα Α" },
      { id: "chain-b", name: "Αλυσίδα Β" },
    ],
    products: [
      {
        id: "product-1",
        name: "Καφές \"Ελληνικός\"",
        brand: "Μάρκα",
        category: "Καφές",
        image_url: "https://example.com/coffee.jpg",
        retailer_prices: [
          {
            retailer: "chain-a",
            country: "GR",
            price: 3.5,
            last_updated: "2026-07-17T00:00:00",
            price_change: {
              previous_price: 4,
              amount: -0.5,
              percentage: -12.5,
              changed_at: "2026-07-17T11:00:00.000Z",
              compared_at: "2026-07-17T10:00:00.000Z",
            },
          },
          { retailer: "chain-b", country: "GR", price: 3.7 },
        ],
      },
      {
        id: "product-2",
        name: "Γάλα",
        retailer_prices: [
          {
            retailer: "chain-b",
            retailer_display_name: "Κατάστημα Β",
            country: "GR",
            price: 2.2,
            price_change: {
              previous_price: 2,
              amount: 0.2,
              percentage: 10,
              changed_at: "2026-07-17T09:00:00.000Z",
            },
          },
        ],
      },
    ],
  };
}

test("price-change CSV includes every active retailer change in spreadsheet-safe UTF-8", () => {
  const csv = createPriceChangesCsv(snapshot());

  assert.equal(csv.startsWith("\uFEFFcatalog_generated_at,"), true);
  assert.equal(csv.endsWith("\r\n"), true);
  assert.match(csv, /"Καφές ""Ελληνικός"""/);
  assert.match(csv, /"Αλυσίδα Α"/);
  assert.match(csv, /"decrease"/);
  assert.match(csv, /"increase"/);
  assert.deepEqual(inspectPriceChangesCsv(csv), {
    rowCount: 2,
    generatedAt: "2026-07-17T12:00:00.000Z",
  });
});

test("price-change CSV remains a valid header-only export when no changes are active", () => {
  const csv = createPriceChangesCsv({ generated_at: "2026-07-17T12:00:00.000Z" });

  assert.deepEqual(inspectPriceChangesCsv(csv), {
    rowCount: 0,
    generatedAt: "",
  });
});

test("price-change JSON contains compact display records and summary counts", () => {
  const payload = createPriceChangesPayload(snapshot());

  assert.deepEqual(payload.stats, {
    changes: 2,
    products: 2,
    retailers: 2,
    decreases: 1,
    increases: 1,
    catalog_products: 2,
  });
  assert.deepEqual(payload.changes[0], {
    product_id: "product-1",
    product_name: "Καφές \"Ελληνικός\"",
    brand: "Μάρκα",
    category: "Καφές",
    image_url: "https://example.com/coffee.jpg",
    retailer_id: "chain-a",
    retailer_name: "Αλυσίδα Α",
    previous_price: 4,
    current_price: 3.5,
    amount: -0.5,
    percentage: -12.5,
    direction: "decrease",
    changed_at: "2026-07-17T11:00:00.000Z",
    compared_at: "2026-07-17T10:00:00.000Z",
    offer_updated_at: "2026-07-17T00:00:00",
  });
  assert.deepEqual(inspectPriceChangesJson(payload), {
    rowCount: 2,
    generatedAt: "2026-07-17T12:00:00.000Z",
  });
});

test("price-change JSON inspection rejects malformed display data", () => {
  assert.throws(
    () => inspectPriceChangesJson({ schema_version: 1, changes: [{ amount: "0.50" }] }),
    /invalid/,
  );
});
