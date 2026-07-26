export const PRICE_WATCHES_KEY = "posokanei-price-watches";
export const MAX_PRICE_WATCHES = 40;

const STORAGE_VERSION = 1;
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,120}$/;
const MAX_TARGET_PRICE = 100000;

function normalizeProductId(value) {
  const productId = String(value ?? "").trim();
  if (!ID_PATTERN.test(productId)) throw new Error("invalid_price_watch_product");
  return productId;
}

function normalizeTargetPrice(value) {
  if (value === null || value === undefined || value === "") return null;
  const targetPrice = Number(value);
  if (!Number.isFinite(targetPrice) || targetPrice <= 0 || targetPrice > MAX_TARGET_PRICE) {
    throw new Error("invalid_price_watch_target");
  }
  return Math.round(targetPrice * 100) / 100;
}

function normalizeDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid_price_watch_date");
  return date.toISOString();
}

function normalizeWatch(value) {
  return {
    productId: normalizeProductId(value?.productId),
    targetPrice: normalizeTargetPrice(value?.targetPrice),
    createdAt: normalizeDate(value?.createdAt),
    updatedAt: normalizeDate(value?.updatedAt),
  };
}

export function parsePriceWatches(rawValue) {
  try {
    const payload = typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;
    const values = payload?.version === STORAGE_VERSION ? payload.watches : [];
    if (!Array.isArray(values)) return [];

    const byProduct = new Map();
    values.forEach((value) => {
      try {
        const watch = normalizeWatch(value);
        const existing = byProduct.get(watch.productId);
        if (!existing || watch.updatedAt > existing.updatedAt) {
          byProduct.set(watch.productId, watch);
        }
      } catch {
        // Ignore corrupt entries without discarding the valid local watchlist.
      }
    });

    return [...byProduct.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_PRICE_WATCHES);
  } catch {
    return [];
  }
}

export function loadPriceWatches(storage = globalThis.localStorage) {
  try {
    return parsePriceWatches(storage?.getItem(PRICE_WATCHES_KEY));
  } catch {
    return [];
  }
}

export function persistPriceWatches(watches, storage = globalThis.localStorage) {
  const normalized = parsePriceWatches({ version: STORAGE_VERSION, watches });
  if (storage?.setItem) {
    storage.setItem(
      PRICE_WATCHES_KEY,
      JSON.stringify({ version: STORAGE_VERSION, watches: normalized }),
    );
  }
  return normalized;
}

export function upsertPriceWatch(
  watches,
  { productId, targetPrice = null },
  { now = Date.now() } = {},
) {
  const current = parsePriceWatches({ version: STORAGE_VERSION, watches });
  const normalizedProductId = normalizeProductId(productId);
  const normalizedTarget = normalizeTargetPrice(targetPrice);
  const timestamp = normalizeDate(now);
  const existing = current.find((watch) => watch.productId === normalizedProductId);
  const next = [
    {
      productId: normalizedProductId,
      targetPrice: normalizedTarget,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    },
    ...current.filter((watch) => watch.productId !== normalizedProductId),
  ];
  return parsePriceWatches({ version: STORAGE_VERSION, watches: next });
}

export function removePriceWatch(watches, productId) {
  const normalizedProductId = normalizeProductId(productId);
  return parsePriceWatches({
    version: STORAGE_VERSION,
    watches: watches.filter((watch) => watch.productId !== normalizedProductId),
  });
}

export function priceWatchTargetStatus(watch, currentPrice) {
  if (watch?.targetPrice == null) return { status: "no-target", difference: null };
  const price = Number(currentPrice);
  if (!Number.isFinite(price) || price <= 0) {
    return { status: "unavailable", difference: null };
  }
  const difference = Math.round((price - watch.targetPrice) * 100) / 100;
  return difference <= 0
    ? { status: "met", difference: Math.abs(difference) }
    : { status: "above", difference };
}
