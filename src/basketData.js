export const BASKET_DATA_SCHEMA = "agenticspiros.posokanei-basket";
export const BASKET_DATA_VERSION = 1;

const MAX_ITEMS = 60;
const MAX_RETAILERS = 30;
const MAX_FILE_SIZE = 256 * 1024;
const PRODUCT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,120}$/;
const STOP_COSTS = new Set([0, 2, 5, 10]);

function normalizeProductId(value) {
  const productId = String(value ?? "").trim();
  if (!PRODUCT_ID_PATTERN.test(productId)) throw new Error("invalid_product_id");
  return productId;
}

function normalizeBasket(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > MAX_ITEMS) {
    throw new Error("invalid_basket_size");
  }
  const items = new Map();
  entries.forEach((entry) => {
    const productId = normalizeProductId(entry?.productId);
    const quantity = Number(entry?.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      throw new Error("invalid_quantity");
    }
    items.set(productId, quantity);
  });
  return [...items].map(([productId, quantity]) => ({ productId, quantity }));
}

function normalizeRetailerIds(values) {
  if (values === null || values === undefined) return null;
  if (!Array.isArray(values) || values.length > MAX_RETAILERS) {
    throw new Error("invalid_retailer_filter");
  }
  const retailerIds = [...new Set(values.map(normalizeProductId))];
  return retailerIds.length ? retailerIds : null;
}

function normalizeSettings(settings = {}) {
  const maxChains = Number(settings.maxChains ?? 1);
  const extraStopCost = Number(settings.extraStopCost ?? 0);
  if (![1, 2, 3, 4].includes(maxChains)) throw new Error("invalid_stops");
  if (!STOP_COSTS.has(extraStopCost)) throw new Error("invalid_stop_cost");
  return {
    maxChains,
    retailerIds: normalizeRetailerIds(settings.retailerIds),
    extraStopCost,
  };
}

export function formatBasketData({
  basket,
  productMap,
  maxChains,
  retailerIds,
  extraStopCost,
  exportedAt = new Date().toISOString(),
}) {
  const normalizedBasket = normalizeBasket(basket);
  const settings = normalizeSettings({ maxChains, retailerIds, extraStopCost });
  const payload = {
    schema: BASKET_DATA_SCHEMA,
    version: BASKET_DATA_VERSION,
    exportedAt,
    basket: normalizedBasket.map((entry) => ({
      ...entry,
      name: String(productMap.get(entry.productId)?.name ?? "").slice(0, 500),
    })),
    settings,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function parseBasketData(value) {
  const text = String(value ?? "");
  if (!text || text.length > MAX_FILE_SIZE) throw new Error("invalid_file_size");
  const payload = JSON.parse(text.replace(/^\uFEFF/u, ""));
  if (payload?.schema !== BASKET_DATA_SCHEMA) throw new Error("invalid_schema");
  if (payload?.version !== BASKET_DATA_VERSION) throw new Error("unsupported_version");
  return {
    basket: normalizeBasket(payload.basket),
    ...normalizeSettings(payload.settings),
  };
}
