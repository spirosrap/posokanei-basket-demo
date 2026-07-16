export const SAVED_BASKETS_KEY = "posokanei-saved-baskets";
export const MAX_SAVED_BASKETS = 12;

const STORAGE_VERSION = 1;
const MAX_NAME_LENGTH = 48;
const MAX_ITEMS = 60;
const MAX_RETAILERS = 30;
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,120}$/;
const EXTRA_STOP_COSTS = new Set([0, 2, 5, 10]);

function normalizeName(value) {
  const name = String(value ?? "").replace(/\s+/gu, " ").trim();
  if (!name || name.length > MAX_NAME_LENGTH) throw new Error("invalid_saved_basket_name");
  return name;
}

function normalizeId(value) {
  const id = String(value ?? "").trim();
  if (!ID_PATTERN.test(id)) throw new Error("invalid_saved_basket_id");
  return id;
}

function normalizeBasket(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.length > MAX_ITEMS) {
    throw new Error("invalid_saved_basket_items");
  }
  const items = new Map();
  entries.forEach((entry) => {
    const productId = normalizeId(entry?.productId);
    const quantity = Number(entry?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999) {
      throw new Error("invalid_saved_basket_quantity");
    }
    items.set(productId, Math.max(1, Math.round(quantity)));
  });
  return [...items].map(([productId, quantity]) => ({ productId, quantity }));
}

function normalizeRetailerIds(values) {
  if (values === null || values === undefined) return null;
  if (!Array.isArray(values) || !values.length || values.length > MAX_RETAILERS) {
    throw new Error("invalid_saved_basket_retailers");
  }
  return [...new Set(values.map(normalizeId))];
}

function normalizeMaxChains(value) {
  const maxChains = Number(value);
  if (![1, 2, 3, 4].includes(maxChains)) throw new Error("invalid_saved_basket_stops");
  return maxChains;
}

function normalizeExtraStopCost(value) {
  const cost = Number(value ?? 0);
  if (!EXTRA_STOP_COSTS.has(cost)) throw new Error("invalid_saved_basket_stop_cost");
  return cost;
}

function normalizeDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid_saved_basket_date");
  return date.toISOString();
}

function normalizeStoredBasket(value) {
  return {
    id: normalizeId(value?.id),
    name: normalizeName(value?.name),
    basket: normalizeBasket(value?.basket),
    maxChains: normalizeMaxChains(value?.maxChains),
    retailerIds: normalizeRetailerIds(value?.retailerIds),
    extraStopCost: normalizeExtraStopCost(value?.extraStopCost),
    updatedAt: normalizeDate(value?.updatedAt),
  };
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ??
    `saved-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function parseSavedBaskets(rawValue) {
  try {
    const payload = typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;
    const values = Array.isArray(payload)
      ? payload
      : payload?.version === STORAGE_VERSION
        ? payload.baskets
        : [];
    if (!Array.isArray(values)) return [];
    return values
      .flatMap((value) => {
        try {
          return [normalizeStoredBasket(value)];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_SAVED_BASKETS);
  } catch {
    return [];
  }
}

export function loadSavedBaskets(storage = globalThis.localStorage) {
  try {
    return parseSavedBaskets(storage?.getItem(SAVED_BASKETS_KEY));
  } catch {
    return [];
  }
}

export function persistSavedBaskets(baskets, storage = globalThis.localStorage) {
  const normalized = parseSavedBaskets({ version: STORAGE_VERSION, baskets });
  if (storage?.setItem) {
    storage?.setItem(
      SAVED_BASKETS_KEY,
      JSON.stringify({ version: STORAGE_VERSION, baskets: normalized }),
    );
  }
  return normalized;
}

export function upsertSavedBasket(
  baskets,
  draft,
  { now = Date.now(), id = null } = {},
) {
  const current = parseSavedBaskets({ version: STORAGE_VERSION, baskets });
  const name = normalizeName(draft?.name);
  const existing = current.find(
    (basket) => basket.name.toLocaleLowerCase("el-GR") === name.toLocaleLowerCase("el-GR"),
  );
  const saved = normalizeStoredBasket({
    id: existing?.id ?? id ?? createId(),
    name,
    basket: draft?.basket,
    maxChains: draft?.maxChains,
    retailerIds: draft?.retailerIds,
    extraStopCost: draft?.extraStopCost,
    updatedAt: now,
  });
  return [saved, ...current.filter((basket) => basket.id !== saved.id)].slice(
    0,
    MAX_SAVED_BASKETS,
  );
}

export function removeSavedBasket(baskets, id) {
  return parseSavedBaskets({ version: STORAGE_VERSION, baskets }).filter(
    (basket) => basket.id !== id,
  );
}
