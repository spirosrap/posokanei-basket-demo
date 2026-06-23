const API_ORIGIN = "https://api.posokanei.gov.gr";
const PROXY_BASE = import.meta.env.DEV
  ? "https://agenticspiros.com/demo/posokanei-basket/api/posokanei.php"
  : "./api/posokanei.php";
const UPDATE_STATUS_URL = import.meta.env.DEV
  ? "https://agenticspiros.com/demo/posokanei-basket/api/update-status.php"
  : "./api/update-status.php";
const CATALOG_SNAPSHOT_URL = "./data/catalog.json";

const PAGE_SIZE = 30;
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

async function fetchJson(resource, params = {}, timeout = 12000) {
  const timer = withTimeout(timeout);
  try {
    const response = await fetch(proxyUrl(resource, params), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: timer.signal,
    });

    if (!response.ok) {
      throw new Error(`PosoKanei proxy ${response.status}`);
    }

    return response.json();
  } finally {
    timer.clear();
  }
}

async function fetchDirectJson(url, timeout = 12000) {
  const timer = withTimeout(timeout);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: timer.signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed ${response.status}`);
    }

    return response.json();
  } finally {
    timer.clear();
  }
}

async function fetchCatalogSnapshot() {
  if (!catalogSnapshotPromise) {
    catalogSnapshotPromise = fetchDirectJson(CATALOG_SNAPSHOT_URL, 20000);
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

function normalizePrice(entry) {
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
  return [String(retailerId).toLowerCase(), price];
}

export function normalizeProduct(raw) {
  const name = raw.name || raw.title || "Προϊόν";
  const id = String(raw.id ?? raw.gtin ?? raw.barcode ?? raw.product_id ?? crypto.randomUUID());
  const priceEntries = firstArray({
    products:
      raw.retailer_prices ||
      raw.prices ||
      raw.retailers ||
      raw.offers ||
      raw.daily_prices ||
      [],
  })
    .map(normalizePrice)
    .filter(Boolean);

  return {
    id,
    gtin: raw.gtin || raw.barcode || raw.barcodes?.[0] || "",
    name: name.trim(),
    brand: raw.brand || "",
    category: raw.category || raw.subcategory || "Προϊόντα",
    categoryIds: raw.category_ids || [],
    unit: raw.unit || "τεμ.",
    unitQuantity: unitLabel(raw),
    imageUrl: absoluteApiUrl(raw.image_url || raw.imageUrl),
    description: raw.description || "",
    tile: productTile(name),
    tint: "#e0f2fe",
    prices: Object.fromEntries(priceEntries),
    retailerCount: raw.price_stats?.retailer_count ?? priceEntries.length,
    updatedAt: raw.updated_at || "",
    source: "live",
  };
}

function normalizeProductResponse(raw) {
  const products = firstArray(raw).map(normalizeProduct);
  return {
    products,
    total: Number(raw?.total ?? products.length) || products.length,
    page: Number(raw?.page ?? 1) || 1,
    pageSize: Number(raw?.page_size ?? products.length) || products.length,
    totalPages: Number(raw?.total_pages ?? 1) || 1,
    hasNext: Boolean(raw?.has_next),
    queryTimeMs: Number(raw?.query_time_ms ?? 0) || null,
  };
}

function normalizeSnapshotProducts(rawProducts = []) {
  return rawProducts.map(normalizeProduct);
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

async function snapshotProductResponse({
  query = "",
  categoryId = "all",
  page = 1,
  pageSize = PAGE_SIZE,
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
    .sort((a, b) => a.name.localeCompare(b.name, "el"));

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

export async function fetchHealth() {
  const stats = await fetchJson("stats", {}, 7000).catch(async () => {
    const snapshot = await fetchCatalogSnapshot();
    return {
      ...(snapshot.stats || {}),
      snapshotGeneratedAt: snapshot.generated_at || "",
      source: "snapshot",
    };
  });
  return {
    totalProducts: Number(stats.total_products ?? 0) || 0,
    activeProducts: Number(stats.active_products ?? stats.total_products ?? 0) || 0,
    retailerCount: Number(stats.retailer_count ?? 0) || 0,
    productsOnDiscount: Number(stats.products_on_discount ?? 0) || 0,
    timestamp: stats.timestamp || "",
    snapshotGeneratedAt: stats.snapshotGeneratedAt || "",
    source: stats.source || "proxy",
  };
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
  };
}

export async function fetchRetailers() {
  const raw = await fetchJson("retailers", { countries: "GR" }).catch(async () => {
    const snapshot = await fetchCatalogSnapshot();
    return { retailers: snapshot.retailers || [] };
  });
  const list = firstArray({ products: raw.retailers || raw });
  return list
    .map(normalizeRetailer)
    .filter((retailer) => retailer.country === "GR")
    .sort((a, b) => a.name.localeCompare(b.name, "el"));
}

export async function fetchCategories() {
  const raw = await fetchJson("categories").catch(async () => {
    const snapshot = await fetchCatalogSnapshot();
    return { categories: snapshot.categories || [] };
  });
  const list = firstArray({ products: raw.categories || raw });
  return list
    .map(normalizeCategory)
    .filter((category) => category.id && category.name && category.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "el"));
}

export async function fetchProducts({
  query = "",
  categoryId = "all",
  page = 1,
  pageSize = PAGE_SIZE,
} = {}) {
  const trimmed = query.trim();
  const barcode = /^\d{8,14}$/.test(trimmed) ? trimmed : "";

  if (barcode) {
    try {
      const product = await fetchJson("barcode", { barcode }, 10000);
      return {
        products: [normalizeProduct(product)],
        total: 1,
        page: 1,
        pageSize: 1,
        totalPages: 1,
        hasNext: false,
        queryTimeMs: null,
      };
    } catch {
      return snapshotProductResponse({ query: trimmed, categoryId, page, pageSize });
    }
  }

  if (trimmed.length >= 2 || categoryId !== "all") {
    return searchByTitle(trimmed, categoryId, page, pageSize).catch(() =>
      snapshotProductResponse({ query: trimmed, categoryId, page, pageSize }),
    );
  }

  return fetchJson("products", {
    page,
    page_size: pageSize,
    sort_by: "name",
    sort_order: "asc",
    countries: "GR",
  })
    .then(normalizeProductResponse)
    .catch(() => snapshotProductResponse({ query: trimmed, categoryId, page, pageSize }));
}

function searchByTitle(query, categoryId, page, pageSize) {
  const params = {
    page,
    page_size: pageSize,
    sort_by: "name",
    sort_order: "asc",
    countries: "GR",
  };
  if (query.trim().length >= 2) params.title = query.trim();
  if (categoryId !== "all") params.category_id = categoryId;
  return fetchJson("search", params).then(normalizeProductResponse);
}
