import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const UTF8_BOM = "\uFEFF";

export const PRICE_CHANGE_CSV_COLUMNS = [
  "catalog_generated_at",
  "change_recorded_at",
  "comparison_snapshot_at",
  "direction",
  "product_id",
  "product_name",
  "brand",
  "category",
  "retailer_id",
  "retailer_name",
  "previous_price_eur",
  "current_price_eur",
  "change_eur",
  "change_percent",
  "offer_last_updated",
];

export const PRICE_CHANGES_SCHEMA_VERSION = 1;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function retailerId(offer) {
  return String(offer?.retailer || offer?.retailer_id || "").trim();
}

function retailerName(offer, retailersById) {
  const id = retailerId(offer).toLowerCase();
  return String(
    offer?.retailer_display_name
      || offer?.retailer_name
      || retailersById.get(id)?.name
      || id,
  ).trim();
}

function decimal(value, digits) {
  const number = finiteNumber(value);
  return number === null ? "" : number.toFixed(digits);
}

function csvField(value) {
  const clean = String(value ?? "")
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/"/g, '""');
  return `"${clean}"`;
}

function compareRows(left, right) {
  return String(right.change_recorded_at).localeCompare(String(left.change_recorded_at))
    || Math.abs(Number(right.change_eur)) - Math.abs(Number(left.change_eur))
    || String(left.product_name).localeCompare(String(right.product_name), "el")
    || String(left.retailer_name).localeCompare(String(right.retailer_name), "el");
}

export function collectPriceChangeRows(snapshot) {
  const generatedAt = String(snapshot?.generated_at || "");
  const retailersById = new Map(
    (Array.isArray(snapshot?.retailers) ? snapshot.retailers : [])
      .map((retailer) => [String(retailer?.id || "").trim().toLowerCase(), retailer])
      .filter(([id]) => id),
  );
  const rows = [];

  for (const product of Array.isArray(snapshot?.products) ? snapshot.products : []) {
    for (const offer of Array.isArray(product?.retailer_prices) ? product.retailer_prices : []) {
      const change = offer?.price_change;
      const id = retailerId(offer);
      const currentPrice = finiteNumber(offer?.price);
      const previousPrice = finiteNumber(change?.previous_price);
      const amount = finiteNumber(change?.amount);
      const percentage = finiteNumber(change?.percentage);
      if (
        !change
        || !id
        || currentPrice === null
        || previousPrice === null
        || amount === null
        || percentage === null
      ) {
        continue;
      }

      rows.push({
        catalog_generated_at: generatedAt,
        change_recorded_at: String(change.changed_at || ""),
        comparison_snapshot_at: String(change.compared_at || ""),
        direction: amount < 0 ? "decrease" : amount > 0 ? "increase" : "unchanged",
        product_id: String(product?.id || ""),
        product_name: String(product?.name || ""),
        brand: String(product?.brand || ""),
        category: String(product?.category || ""),
        product_image_url: String(product?.image_url || ""),
        retailer_id: id,
        retailer_name: retailerName(offer, retailersById),
        previous_price_eur: decimal(previousPrice, 2),
        current_price_eur: decimal(currentPrice, 2),
        change_eur: decimal(amount, 2),
        change_percent: decimal(percentage, 1),
        offer_last_updated: String(offer?.last_updated || ""),
      });
    }
  }

  return rows.sort(compareRows);
}

export function createPriceChangesCsv(snapshot) {
  return renderPriceChangesCsv(collectPriceChangeRows(snapshot));
}

export function createPriceChangesPayload(snapshot) {
  const rows = collectPriceChangeRows(snapshot);
  const productIds = new Set(rows.map((row) => row.product_id));
  const retailerIds = new Set(rows.map((row) => row.retailer_id));
  const changes = rows.map((row) => ({
    product_id: row.product_id,
    product_name: row.product_name,
    brand: row.brand,
    category: row.category,
    image_url: row.product_image_url,
    retailer_id: row.retailer_id,
    retailer_name: row.retailer_name,
    previous_price: Number(row.previous_price_eur),
    current_price: Number(row.current_price_eur),
    amount: Number(row.change_eur),
    percentage: Number(row.change_percent),
    direction: row.direction,
    changed_at: row.change_recorded_at,
    compared_at: row.comparison_snapshot_at,
    offer_updated_at: row.offer_last_updated,
  }));

  return {
    schema_version: PRICE_CHANGES_SCHEMA_VERSION,
    generated_at: String(snapshot?.generated_at || ""),
    source: String(snapshot?.source || ""),
    retention_days: Number(snapshot?.price_change_stats?.retention_days || 0),
    stats: {
      changes: changes.length,
      products: productIds.size,
      retailers: retailerIds.size,
      decreases: changes.filter((change) => change.direction === "decrease").length,
      increases: changes.filter((change) => change.direction === "increase").length,
      catalog_products: Array.isArray(snapshot?.products) ? snapshot.products.length : 0,
    },
    changes,
  };
}

function renderPriceChangesCsv(rows) {
  const lines = [
    PRICE_CHANGE_CSV_COLUMNS.join(","),
    ...rows.map((row) => PRICE_CHANGE_CSV_COLUMNS.map((column) => csvField(row[column])).join(",")),
  ];
  return `${UTF8_BOM}${lines.join("\r\n")}\r\n`;
}

export async function writePriceChangesCsv(snapshot, outputPath) {
  const rows = collectPriceChangeRows(snapshot);
  const csv = renderPriceChangesCsv(rows);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, csv, "utf8");
  return rows.length;
}

export async function writePriceChangesJson(snapshot, outputPath) {
  const payload = createPriceChangesPayload(snapshot);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload)}\n`, "utf8");
  return payload.changes.length;
}

export function inspectPriceChangesCsv(csv) {
  const normalized = String(csv || "").replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/).filter(Boolean);
  const expectedHeader = PRICE_CHANGE_CSV_COLUMNS.join(",");
  if (lines[0] !== expectedHeader) {
    throw new Error("price-change CSV header is invalid");
  }

  const generatedAtValues = new Set();
  for (const line of lines.slice(1)) {
    const firstField = /^"((?:[^"]|"")*)",/.exec(line);
    if (!firstField) throw new Error("price-change CSV row is invalid");
    generatedAtValues.add(firstField[1].replace(/""/g, '"'));
  }

  return {
    rowCount: Math.max(0, lines.length - 1),
    generatedAt: generatedAtValues.size === 1 ? [...generatedAtValues][0] : "",
  };
}

export function inspectPriceChangesJson(value) {
  const payload = typeof value === "string" ? JSON.parse(value) : value;
  if (
    payload?.schema_version !== PRICE_CHANGES_SCHEMA_VERSION
    || !Array.isArray(payload?.changes)
    || !payload.changes.every((change) => (
      change
      && typeof change.product_id === "string"
      && typeof change.retailer_id === "string"
      && Number.isFinite(change.previous_price)
      && Number.isFinite(change.current_price)
      && Number.isFinite(change.amount)
      && Number.isFinite(change.percentage)
      && ["decrease", "increase"].includes(change.direction)
    ))
  ) {
    throw new Error("price-change JSON is invalid");
  }

  return {
    rowCount: payload.changes.length,
    generatedAt: String(payload.generated_at || ""),
  };
}
