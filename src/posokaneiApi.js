import { APP_BASE_URL, runtimeAppUrl } from "./appConfig.js";
import { productSortApiValue } from "./productSort.js";

const API_ORIGIN = "https://api.posokanei.gov.gr";
const PROXY_BASE = runtimeAppUrl("api/posokanei.php");
const UPDATE_STATUS_URL = runtimeAppUrl("api/update-status.php");
const CATALOG_RUNTIME_URL = `${APP_BASE_URL}data/catalog-runtime.json`;
const CATALOG_SNAPSHOT_URL = `${APP_BASE_URL}data/catalog.json`;
const DAILY_BARGAIN_URL = `${APP_BASE_URL}data/daily-bargain.json`;

const PAGE_SIZE = 30;
const REQUEST_CACHE_TTL_MS = 45000;
const RETAILER_COLORS = [
  "#0f766e",
  "#2563eb",
  "#f59e0b",
  "#ef4444",
  "#16a34a",
  "#7c3aed",
  "#0891b2",
  "#be185d",
  "#4f46e5",
  "#15803d",
  "#b45309",
  "#334155",
];

let catalogSnapshotPromise = null;
const responseCache = new Map();

function withTimeout(ms = 12000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => window.clearTimeout(timeout) };
}

function proxyUrl(resource, params = {}) {
  const url = new URL(PROXY_BASE, window.location.href);
  url.searchParams.set("resource", resource);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

async function fetchJson(
  resource,
  params = {},
  timeout = 12000,
  retries = 2,
  cacheTtl = REQUEST_CACHE_TTL_MS,
) {
  const url = proxyUrl(resource, params);
  return fetchCachedJson(url, {
    timeout,
    retries,
    errorLabel: "PosoKanei proxy HTTP",
  }, cacheTtl);
}

async function fetchDirectJson(url, timeout = 12000, retries = 2) {
  return fetchJsonWithRetries(url, { timeout, retries, errorLabel: "Request failed" });
}

function fetchCachedJson(url, options, cacheTtl) {
  const now = Date.now();
  const cached = responseCache.get(url);
  if (cached?.promise) return cached.promise;
  if (cached?.value !== undefined && cached.expiresAt > now) {
    return Promise.resolve(cached.value);
  }

  const promise = fetchJsonWithRetries(url, options)
    .then((value) => {
      responseCache.set(url, {
        value,
        expiresAt: Date.now() + cacheTtl,
      });
      return value;
    })
    .catch((error) => {
      responseCache.delete(url);
      throw error;
    });
  responseCache.set(url, { promise, expiresAt: now + cacheTtl });
  return promise;
}

async function fetchJsonWithRetries(url, { timeout, retries, errorLabel }) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const timer = withTimeout(timeout);
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: timer.signal,
      });

      if (!response.ok) {
        const error = new Error(`${errorLabel} ${response.status}`);
        error.status = response.status;
        throw error;
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isTransientRequestError(error)) throw error;
      await sleep(500 * (attempt + 1));
    } finally {
      timer.clear();
    }
  }

  throw lastError;
}

function isTransientRequestError(error) {
  const status = Number(error?.status || 0);
  return !status || status === 408 || status === 429 || status >= 500;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchCatalogSnapshot() {
  if (!catalogSnapshotPromise) {
    catalogSnapshotPromise = fetchDirectJson(CATALOG_RUNTIME_URL, 30000, 1)
      .catch(() => fetchDirectJson(CATALOG_SNAPSHOT_URL, 45000, 1))
      .catch((error) => {
        catalogSnapshotPromise = null;
        throw error;
      });
  }
  return catalogSnapshotPromise;
}

function firstArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  return (
    raw.products ||
    raw.items ||
    raw.results ||
    raw.data ||
    raw.rows ||
    raw.product_results ||
    []
  );
}

function absoluteApiUrl(value) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${API_ORIGIN}${value.startsWith("/") ? "" : "/"}${value}`;
}

function productTile(name) {
  const letters = String(name || "ΠΡ")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
  return (letters || "ΠΡ").toLowerCase();
}

function fallbackProductId(raw, name) {
  const source = [
    name,
    raw.brand,
    raw.category,
    raw.subcategory,
    raw.unit,
    raw.unit_quantity,
    raw.image_url,
  ]
    .filter(Boolean)
    .join("|");
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return `snapshot-${hash.toString(36)}`;
}

function unitLabel(raw) {
  const quantity = raw.unit_quantity ?? raw.unitQuantity;
  const unit = raw.unit || "τεμ.";
  if (quantity === undefined || quantity === null || quantity === "") return unit;
  const numeric = Number(quantity);
  const formatted = Number.isFinite(numeric)
    ? numeric.toLocaleString("el-GR", { maximumFractionDigits: 2 })
    : String(quantity);
  return `${formatted} ${unit}`;
}

function normalizeOffer(entry, unitAmount) {
  if (!entry || typeof entry !== "object") return null;
  const retailerId =
    entry.retailer_id ||
    entry.retailer ||
    entry.chain_id ||
    entry.chain ||
    entry.name ||
    entry.retailer_name;
  const price = Number(entry.price ?? entry.final_price ?? entry.value);
  if (!retailerId || !Number.isFinite(price)) return null;
  const normalized = Number(entry.price_normalized ?? entry.unit_price);
  const fallbackUnitPrice = unitAmount > 0 ? price / unitAmount : null;
  const unitPrice = Number.isFinite(normalized) && normalized > 0
    ? normalized
    : fallbackUnitPrice;
  return {
    retailerId: String(retailerId).toLowerCase(),
    price,
    unitPrice: Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : null,
  };
}

export function normalizeProduct(raw, source = "live") {
  const name = raw.name || raw.title || "Προϊόν";
  const id = String(raw.id ?? raw.gtin ?? raw.barcode ?? raw.product_id ?? fallbackProductId(raw, name));
  const generatedImageUrl = raw.has_image
    ? `${API_ORIGIN}/images/product/${encodeURIComponent(id)}${raw.image_version ? `?v=${encodeURIComponent(raw.image_version)}` : ""}`
    : "";
  const parsedUnitAmount = Number(raw.unit_quantity ?? raw.unitAmount);
  const unitAmount = Number.isFinite(parsedUnitAmount) && parsedUnitAmount > 0
    ? parsedUnitAmount
    : null;
  const priceEntries = firstArray({
    products:
      raw.retailer_prices ||
      raw.prices ||
      raw.retailers ||
      raw.offers ||
      raw.daily_prices ||
      [],
  })
    .map((entry) => normalizeOffer(entry, unitAmount))
    .filter(Boolean);

  return {
    id,
    gtin: raw.gtin || raw.barcode || raw.barcodes?.[0] || "",
    name: name.trim(),
    brand: raw.brand || "",
    category: raw.category || raw.subcategory || "Προϊόντα",
    categoryIds: raw.category_ids || [],
    unit: raw.unit || "τεμ.",
    unitAmount,
    unitQuantity: unitLabel(raw),
    imageUrl: absoluteApiUrl(raw.image_url || raw.imageUrl || generatedImageUrl),
    description: raw.description || "",
    tile: productTile(name),
    tint: "#e0f2fe",
    prices: Object.fromEntries(priceEntries.map((entry) => [entry.retailerId, entry.price])),
    unitPrices: Object.fromEntries(
      priceEntries
        .filter((entry) => entry.unitPrice != null)
        .map((entry) => [entry.retailerId, entry.unitPrice]),
    ),
    retailerCount: raw.price_stats?.retailer_count ?? priceEntries.length,
    updatedAt: raw.updated_at || "",
    source,
  };
}

function normalizeProductResponse(raw, source = "live") {
  const responseSource = raw?.source || source;
  const products = firstArray(raw).map((product) => normalizeProduct(product, responseSource));
  return {
    products,
    total: Number(raw?.total ?? products.length) || products.length,
    page: Number(raw?.page ?? 1) || 1,
    pageSize: Number(raw?.page_size ?? products.length) || products.length,
    totalPages: Number(raw?.total_pages ?? 1) || 1,
    hasNext: Boolean(raw?.has_next),
    queryTimeMs: Number(raw?.query_time_ms ?? 0) || null,
    source: responseSource,
  };
}

function normalizeSnapshotProducts(rawProducts = []) {
  return rawProducts.map((product) => normalizeProduct(product, "snapshot"));
}

function searchableText(product) {
  return [
    product.name,
    product.brand,
    product.category,
    product.gtin,
    product.unitQuantity,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("el-GR");
}

function productMatchesCategory(product, categoryId) {
  if (categoryId === "all") return true;
  return product.category === categoryId || product.categoryIds?.includes(categoryId);
}

function minimumProductPrice(product) {
  const prices = Object.values(product.prices || {}).filter(Number.isFinite);
  return prices.length ? Math.min(...prices) : null;
}

function compareProductsByPrice(left, right) {
  const leftPrice = minimumProductPrice(left);
  const rightPrice = minimumProductPrice(right);
  if (leftPrice == null && rightPrice != null) return 1;
  if (leftPrice != null && rightPrice == null) return -1;
  if (leftPrice !== rightPrice) return (leftPrice ?? 0) - (rightPrice ?? 0);
  return left.name.localeCompare(right.name, "el");
}

function minimumProductUnitPrice(product) {
  const unitPrices = Object.values(product.unitPrices || {}).filter(Number.isFinite);
  return unitPrices.length ? Math.min(...unitPrices) : null;
}

function compareProductsByUnitPrice(left, right) {
  const leftPrice = minimumProductUnitPrice(left);
  const rightPrice = minimumProductUnitPrice(right);
  if (leftPrice == null && rightPrice != null) return 1;
  if (leftPrice != null && rightPrice == null) return -1;
  if (leftPrice !== rightPrice) return (leftPrice ?? 0) - (rightPrice ?? 0);
  return left.name.localeCompare(right.name, "el");
}

function productComparator(sortMode) {
  if (sortMode === "unit_price") return compareProductsByUnitPrice;
  if (sortMode === "name") return (a, b) => a.name.localeCompare(b.name, "el");
  return compareProductsByPrice;
}

async function snapshotProductResponse({
  query = "",
  categoryId = "all",
  page = 1,
  pageSize = PAGE_SIZE,
  sortMode = "price",
} = {}) {
  const snapshot = await fetchCatalogSnapshot();
  const normalizedQuery = query.trim().toLocaleLowerCase("el-GR");
  const barcode = /^\d{8,14}$/.test(normalizedQuery) ? normalizedQuery : "";
  const products = normalizeSnapshotProducts(snapshot.products || [])
    .filter((product) => {
      if (!productMatchesCategory(product, categoryId)) return false;
      if (barcode) return product.gtin === barcode;
      return !normalizedQuery || searchableText(product).includes(normalizedQuery);
    })
    .sort(productComparator(sortMode));

  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Number(pageSize) || PAGE_SIZE);
  const start = (safePage - 1) * safePageSize;
  const pagedProducts = products.slice(start, start + safePageSize);
  const totalPages = Math.max(1, Math.ceil(products.length / safePageSize));

  return {
    products: pagedProducts,
    total: products.length,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
    hasNext: safePage < totalPages,
    queryTimeMs: null,
    source: "snapshot",
  };
}

export function normalizeRetailer(raw, index = 0) {
  const id = String(raw.id || raw.retailer || raw.name || `retailer-${index}`).toLowerCase();
  const name = raw.name || raw.retailer_display_name || id;
  return {
    id,
    name,
    shortName: shortName(name, id),
    color: RETAILER_COLORS[index % RETAILER_COLORS.length],
    country: raw.country || "GR",
    logoUrl: absoluteApiUrl(raw.logo_url),
  };
}

function shortName(name, id) {
  const special = {
    ab_vasilopoulos: "ΑΒ",
    sklavenitis: "ΣΚ",
    masoutis: "ΜΣ",
    mymarket: "MY",
    market_in: "MI",
    kritikos: "ΚΡ",
    galaxias: "ΓΞ",
    synka: "ΣΥ",
    halkiadakis: "ΧΑ",
    lidl: "LD",
  };
  if (special[id]) return special[id];
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function normalizeCategory(raw) {
  const id = raw.category_id || raw.id || raw.name || raw.category_name;
  const name = raw.category_name || raw.name || "Κατηγορία";
  return {
    id: String(id),
    name,
    count: Number(raw.product_count ?? raw.total_product_count ?? 0) || 0,
    imageUrl: absoluteApiUrl(raw.image_url),
  };
}

function normalizeHealthStats(stats, liveError = "") {
  return {
    totalProducts: Number(stats.total_products ?? 0) || 0,
    activeProducts: Number(stats.active_products ?? stats.total_products ?? 0) || 0,
    retailerCount: Number(stats.retailer_count ?? 0) || 0,
    productsOnDiscount: Number(stats.products_on_discount ?? 0) || 0,
    timestamp: stats.timestamp || "",
    snapshotGeneratedAt:
      stats.snapshot_generated_at || stats.snapshotGeneratedAt || "",
    source: stats.source || "proxy",
    liveError,
  };
}

function normalizeRetailerResponse(raw) {
  const list = firstArray({ products: raw?.retailers || raw });
  return list
    .map(normalizeRetailer)
    .filter((retailer) => retailer.country === "GR")
    .sort((a, b) => a.name.localeCompare(b.name, "el"));
}

function normalizeCategoryResponse(raw) {
  const list = firstArray({ products: raw?.categories || raw });
  return list
    .map(normalizeCategory)
    .filter((category) => category.id && category.name && category.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "el"));
}

export async function fetchCatalogBootstrap({ productIds = [], sortMode = "price" } = {}) {
  const ids = [...new Set(productIds.map((id) => String(id)).filter(Boolean))].slice(0, 60);

  try {
    const raw = await fetchJson(
      "bootstrap",
      {
        ids: ids.join(","),
        page_size: PAGE_SIZE,
        category_limit: 80,
        sort_by: productSortApiValue(sortMode),
        sort_order: "asc",
        countries: "GR",
      },
      18000,
      2,
      60000,
    );
    const productResult = normalizeProductResponse(raw.products || {}, raw.source || "snapshot");
    return {
      health: normalizeHealthStats(raw.stats || {}, raw.live_error || ""),
      retailers: normalizeRetailerResponse(raw.retailers || []),
      categories: normalizeCategoryResponse(raw.categories || []),
      productResult,
      basketProducts: firstArray(raw.basket_products || []).map((product) =>
        normalizeProduct(product, raw.source || "snapshot"),
      ),
    };
  } catch {
    const [health, retailers, categories, productResult, basketProducts] = await Promise.all([
      fetchHealth(),
      fetchRetailers(),
      fetchCategories(),
      fetchProducts({ page: 1, sortMode }),
      fetchProductsByIds(ids),
    ]);
    return { health, retailers, categories, productResult, basketProducts };
  }
}

export async function fetchHealth() {
  let liveError = "";
  const stats = await fetchJson("stats", {}, 7000).catch(async (error) => {
    liveError = error?.message || "Το live API δεν απάντησε.";
    const snapshot = await fetchCatalogSnapshot();
    const snapshotProductCount = Array.isArray(snapshot.products) ? snapshot.products.length : 0;
    return {
      ...(snapshot.stats || {}),
      active_products: snapshotProductCount || snapshot.stats?.active_products || 0,
      total_products: snapshotProductCount || snapshot.stats?.total_products || 0,
      snapshotGeneratedAt: snapshot.generated_at || "",
      source: "snapshot",
    };
  });
  return normalizeHealthStats(stats, liveError);
}

export async function fetchUpdateStatus() {
  const raw = await fetchDirectJson(UPDATE_STATUS_URL, 9000);
  return {
    checkedAt: raw.checked_at || raw.checkedAt || "",
    changedSinceLastCheck: Boolean(raw.changed_since_last_check ?? raw.changedSinceLastCheck),
    activeProducts: Number(raw.stats?.active_products ?? raw.activeProducts ?? 0) || 0,
    sampledProducts: Number(raw.sampled_products ?? raw.sampledProducts ?? 0) || 0,
    fingerprint: raw.fingerprint || "",
    status: raw.status || "ok",
    error: raw.error || "",
    detail: raw.detail || "",
    snapshotGeneratedAt: raw.snapshot_generated_at || raw.snapshotGeneratedAt || "",
    refreshStatus: raw.refresh_status || raw.refreshStatus || "",
    refreshCheckedAt: raw.refresh_checked_at || raw.refreshCheckedAt || "",
    refreshError: raw.refresh_error || raw.refreshError || "",
    lastSuccessfulRefreshAt:
      raw.snapshot_generated_at || raw.snapshotGeneratedAt || raw.last_successful_refresh_at || raw.lastSuccessfulRefreshAt || "",
  };
}

export async function fetchDailyBargain() {
  const raw = await fetchDirectJson(`${DAILY_BARGAIN_URL}?v=${Date.now()}`, 9000);
  if (!raw?.product_id || !raw?.product || !raw?.evidence) {
    throw new Error("Daily bargain data is incomplete.");
  }
  const rawBargains = Array.isArray(raw.bargains) && raw.bargains.length ? raw.bargains : [raw];
  const bargains = rawBargains.map(normalizeBargain).filter(Boolean);
  if (!bargains.length) throw new Error("Daily bargain list is incomplete.");

  return {
    ...bargains[0],
    date: raw.date || "",
    generatedAt: raw.generated_at || "",
    catalogGeneratedAt: raw.catalog_generated_at || "",
    bargains,
  };
}

function normalizeBargain(raw) {
  if (!raw?.product_id || !raw?.product || !raw?.evidence) return null;
  return {
    productId: String(raw.product_id),
    headline: raw.headline || "Ευκαιρία τιμής",
    reason: raw.reason || "",
    evidence: {
      bestPrice: Number(raw.evidence.best_price),
      bestRetailerId: raw.evidence.best_retailer_id || "",
      bestRetailerName: raw.evidence.best_retailer_name || "",
      medianPrice: Number(raw.evidence.median_price),
      highestPrice: Number(raw.evidence.highest_price),
      savingsVsHighest: Number(raw.evidence.savings_vs_highest),
      savingsPercentVsHighest: Number(raw.evidence.savings_percent_vs_highest),
      retailerCount: Number(raw.evidence.retailer_count),
    },
    product: normalizeProduct(raw.product, "snapshot"),
  };
}

export async function fetchRetailers() {
  const raw = await fetchJson("retailers", { countries: "GR" }).catch(async () => {
    const snapshot = await fetchCatalogSnapshot();
    return { retailers: snapshot.retailers || [] };
  });
  return normalizeRetailerResponse(raw);
}

export async function fetchCategories() {
  const raw = await fetchJson("categories").catch(async () => {
    const snapshot = await fetchCatalogSnapshot();
    return { categories: snapshot.categories || [] };
  });
  return normalizeCategoryResponse(raw);
}

export async function fetchProducts({
  query = "",
  categoryId = "all",
  page = 1,
  pageSize = PAGE_SIZE,
  sortMode = "price",
} = {}) {
  const trimmed = query.trim();
  const barcode = /^\d{8,14}$/.test(trimmed) ? trimmed : "";

  if (barcode) {
    try {
      const product = await fetchJson("barcode", { barcode }, 10000);
      return {
        products: [normalizeProduct(product, "live")],
        total: 1,
        page: 1,
        pageSize: 1,
        totalPages: 1,
        hasNext: false,
        queryTimeMs: null,
        source: "live",
      };
    } catch {
      return snapshotProductResponse({ query: trimmed, categoryId, page, pageSize, sortMode });
    }
  }

  if (trimmed.length >= 2 || categoryId !== "all") {
    return searchByTitle(trimmed, categoryId, page, pageSize, sortMode).catch(() =>
      snapshotProductResponse({ query: trimmed, categoryId, page, pageSize, sortMode }),
    );
  }

  return fetchJson("products", {
    page,
    page_size: pageSize,
    sort_by: productSortApiValue(sortMode),
    sort_order: "asc",
    countries: "GR",
  })
    .then((raw) => normalizeProductResponse(raw, "live"))
    .catch(() => snapshotProductResponse({
      query: trimmed,
      categoryId,
      page,
      pageSize,
      sortMode,
    }));
}

export async function fetchProductsByIds(productIds = []) {
  const wantedIds = new Set(productIds.map((id) => String(id)));
  if (!wantedIds.size) return [];

  try {
    const raw = await fetchJson(
      "products-by-ids",
      { ids: [...wantedIds].join(",") },
      18000,
      2,
    );
    const products = firstArray(raw).map((product) => normalizeProduct(product, "snapshot"));
    if (products.length) return products;
  } catch {
    // Fall back to the static snapshot when the batch endpoint is unavailable.
  }

  const snapshot = await fetchCatalogSnapshot();
  const productsById = new Map();
  (snapshot.products || []).forEach((rawProduct) => {
    const id = String(rawProduct.id ?? rawProduct.gtin ?? rawProduct.barcode ?? rawProduct.product_id);
    if (wantedIds.has(id)) {
      productsById.set(id, normalizeProduct(rawProduct, "snapshot"));
    }
  });

  return productIds
    .map((id) => productsById.get(String(id)))
    .filter(Boolean);
}

function searchByTitle(query, categoryId, page, pageSize, sortMode) {
  const params = {
    page,
    page_size: pageSize,
    sort_by: productSortApiValue(sortMode),
    sort_order: "asc",
    countries: "GR",
  };
  if (query.trim().length >= 2) params.title = query.trim();
  if (categoryId !== "all") params.category_id = categoryId;
  return fetchJson("search", params).then((raw) => normalizeProductResponse(raw, "live"));
}
