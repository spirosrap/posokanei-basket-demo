export const PRODUCT_SORT_KEY = "posokanei-product-sort";
export const PRODUCT_SORT_MODES = ["price", "unit_price", "name"];

export function normalizeProductSort(value) {
  return PRODUCT_SORT_MODES.includes(value) ? value : "price";
}

export function getInitialProductSort(storage = globalThis.localStorage) {
  try {
    return normalizeProductSort(storage?.getItem(PRODUCT_SORT_KEY));
  } catch {
    return "price";
  }
}

export function saveProductSort(value, storage = globalThis.localStorage) {
  const normalized = normalizeProductSort(value);
  try {
    storage?.setItem(PRODUCT_SORT_KEY, normalized);
  } catch {
    // Sorting still works when strict browser storage rejects writes.
  }
  return normalized;
}

export function productSortApiValue(value) {
  const normalized = normalizeProductSort(value);
  return normalized === "price" ? "price_asc" : normalized;
}
