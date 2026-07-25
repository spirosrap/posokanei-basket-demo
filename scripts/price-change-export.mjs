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

export const PRICE_CHANGES_SCHEMA_VERSION = 2;
const MAX_HISTORY_POINTS = 200;

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

function snapshotRetailersById(snapshot) {
  return new Map(
    (Array.isArray(snapshot?.retailers) ? snapshot.retailers : [])
      .map((retailer) => [String(retailer?.id || "").trim().toLowerCase(), retailer])
      .filter(([id]) => id),
  );
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
  const retailersById = snapshotRetailersById(snapshot);
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
  const products = {};
  const retailers = {};
  const changes = rows.map((row) => {
    products[row.product_id] ||= [
      row.product_name,
      row.brand,
      row.category,
      row.product_image_url,
    ];
    retailers[row.retailer_id] ||= row.retailer_name;
    return [
      row.product_id,
      row.retailer_id,
      Number(row.previous_price_eur),
      Number(row.current_price_eur),
      Number(row.change_eur),
      Number(row.change_percent),
      row.direction === "decrease" ? -1 : 1,
      row.change_recorded_at,
      row.comparison_snapshot_at,
      row.offer_last_updated,
    ];
  });

  return {
    schema_version: PRICE_CHANGES_SCHEMA_VERSION,
    generated_at: String(snapshot?.generated_at || ""),
    source: String(snapshot?.source || ""),
    retention_days: Number(snapshot?.price_change_stats?.retention_days || 0),
    stats: {
      changes: changes.length,
      products: productIds.size,
      retailers: retailerIds.size,
      decreases: rows.filter((row) => row.direction === "decrease").length,
      increases: rows.filter((row) => row.direction === "increase").length,
      catalog_products: Array.isArray(snapshot?.products) ? snapshot.products.length : 0,
    },
    products,
    retailers,
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
  const compactProductsValid = (
    payload?.products
    && typeof payload.products === "object"
    && !Array.isArray(payload.products)
    && Object.entries(payload.products).every(([productId, product]) => (
      productId
      && Array.isArray(product)
      && product.length === 4
      && product.every((field) => typeof field === "string")
    ))
  );
  const compactRetailersValid = (
    payload?.retailers
    && typeof payload.retailers === "object"
    && !Array.isArray(payload.retailers)
    && Object.entries(payload.retailers).every(([retailerIdValue, name]) => (
      retailerIdValue
      && typeof name === "string"
      && name
    ))
  );
  const compactChangesValid = (
    payload?.schema_version === 2
    && compactProductsValid
    && compactRetailersValid
    && Array.isArray(payload?.changes)
    && payload.changes.every((change) => (
      Array.isArray(change)
      && change.length === 10
      && Object.hasOwn(payload.products, change[0])
      && Object.hasOwn(payload.retailers, change[1])
      && Number.isFinite(change[2])
      && Number.isFinite(change[3])
      && Number.isFinite(change[4])
      && Number.isFinite(change[5])
      && [-1, 1].includes(change[6])
      && Number.isFinite(Date.parse(change[7]))
    ))
  );
  const historiesValid = payload?.histories === undefined || (
    payload.histories
    && typeof payload.histories === "object"
    && !Array.isArray(payload.histories)
    && Object.entries(payload.histories).every(([productId, history]) => (
      productId
      && history?.product_id === productId
      && Array.isArray(history?.retailers)
      && history.retailers.length <= 30
      && history.retailers.every((series) => (
        typeof series?.retailer_id === "string"
        && typeof series?.retailer_name === "string"
        && Array.isArray(series?.points)
        && series.points.length <= MAX_HISTORY_POINTS
        && series.points.every((point) => (
          Array.isArray(point)
          && point.length === 2
          && Number.isFinite(Date.parse(point[0]))
          && Number.isFinite(point[1])
          && point[1] > 0
        ))
      ))
    ))
  );
  const legacyChangesValid = (
    payload?.schema_version === 1
    && Array.isArray(payload?.changes)
    && historiesValid
    && payload.changes.every((change) => (
      change
      && typeof change.product_id === "string"
      && typeof change.retailer_id === "string"
      && Number.isFinite(change.previous_price)
      && Number.isFinite(change.current_price)
      && Number.isFinite(change.amount)
      && Number.isFinite(change.percentage)
      && ["decrease", "increase"].includes(change.direction)
    ))
  );
  if (!compactChangesValid && !legacyChangesValid) {
    throw new Error("price-change JSON is invalid");
  }

  return {
    rowCount: payload.changes.length,
    generatedAt: String(payload.generated_at || ""),
  };
}
