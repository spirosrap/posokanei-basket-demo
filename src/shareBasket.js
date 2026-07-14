const SHARE_VERSION = 2;
const SUPPORTED_SHARE_VERSIONS = new Set([1, SHARE_VERSION]);
const MAX_SHARED_ITEMS = 60;
const MAX_SHARED_RETAILERS = 30;
const MAX_PRODUCT_ID_LENGTH = 120;
const MAX_TOKEN_LENGTH = 8192;

export const SHARED_BASKET_PARAM = "basket";

function normalizeProductId(value) {
  const productId = String(value ?? "").trim();
  if (
    !productId ||
    productId.length > MAX_PRODUCT_ID_LENGTH ||
    !/^[a-zA-Z0-9_-]+$/.test(productId)
  ) {
    throw new Error("invalid_product_id");
  }
  return productId;
}

function normalizeQuantity(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999) {
    throw new Error("invalid_quantity");
  }
  return Math.round(quantity * 1000) / 1000;
}

function normalizeStops(value) {
  const stops = Number(value);
  if (!Number.isInteger(stops) || stops < 1 || stops > 4) {
    throw new Error("invalid_stops");
  }
  return stops;
}

function normalizeRetailerIds(values) {
  if (values === null || values === undefined) return null;
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_SHARED_RETAILERS) {
    throw new Error("invalid_retailer_filter");
  }
  return [...new Set(values.map(normalizeProductId))];
}

function normalizeBasket(entries) {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > MAX_SHARED_ITEMS) {
    throw new Error("invalid_basket_size");
  }

  const items = new Map();
  entries.forEach((entry) => {
    const productId = normalizeProductId(entry?.productId ?? entry?.[0]);
    const quantity = normalizeQuantity(entry?.quantity ?? entry?.[1]);
    items.set(productId, quantity);
  });

  return [...items].map(([productId, quantity]) => ({ productId, quantity }));
}

function encodeUtf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeUtf8(value) {
  if (!value || value.length > MAX_TOKEN_LENGTH || !/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error("invalid_share_token");
  }
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeSharedBasket(entries, maxChains = 1, retailerIds = null) {
  const basket = normalizeBasket(entries);
  const payload = {
    v: SHARE_VERSION,
    s: normalizeStops(maxChains),
    i: basket.map(({ productId, quantity }) => [productId, quantity]),
    r: normalizeRetailerIds(retailerIds),
  };
  const token = encodeUtf8(JSON.stringify(payload));
  if (token.length > MAX_TOKEN_LENGTH) throw new Error("share_token_too_long");
  return token;
}

export function decodeSharedBasket(token) {
  const payload = JSON.parse(decodeUtf8(token));
  if (!SUPPORTED_SHARE_VERSIONS.has(payload?.v)) throw new Error("unsupported_share_version");
  return {
    basket: normalizeBasket(payload.i),
    maxChains: normalizeStops(payload.s),
    retailerIds: payload.v >= 2 ? normalizeRetailerIds(payload.r) : null,
  };
}

export function buildSharedBasketUrl(baseUrl, entries, maxChains = 1, retailerIds = null) {
  const url = new URL(baseUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set(
    SHARED_BASKET_PARAM,
    encodeSharedBasket(entries, maxChains, retailerIds),
  );
  return url.toString();
}

export function readSharedBasketUrl(urlValue) {
  const url = new URL(urlValue);
  const token = url.searchParams.get(SHARED_BASKET_PARAM);
  if (!token) return null;
  try {
    return { status: "valid", ...decodeSharedBasket(token) };
  } catch {
    return { status: "invalid", basket: [], maxChains: 1, retailerIds: null };
  }
}
