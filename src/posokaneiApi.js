const API_BASE = "https://api.posokanei.gov.gr";

function withTimeout(ms = 9000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => window.clearTimeout(timeout) };
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
    name: raw.name || raw.title || "Προϊόν",
    brand: raw.brand || "",
    category: raw.category || raw.subcategory || "Προϊόντα",
    unit: raw.unit || "τεμ.",
    unitQuantity: raw.unit_quantity || raw.unitQuantity || "",
    imageUrl: raw.image_url ? `${API_BASE}${raw.image_url}` : raw.imageUrl || "",
    description: raw.description || "",
    tile: (raw.name || raw.title || "ΠΡ").slice(0, 2).toLowerCase(),
    tint: "#e0f2fe",
    prices: Object.fromEntries(priceEntries),
    source: "live",
  };
}

export async function searchProducts(query) {
  const timer = withTimeout();
  try {
    const response = await fetch(`${API_BASE}/products/search`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: query,
        page: 1,
        page_size: 12,
        sort_by: "name",
        sort_order: "asc",
      }),
      signal: timer.signal,
    });

    if (!response.ok) {
      throw new Error(`PosoKanei API ${response.status}`);
    }

    const raw = await response.json();
    return firstArray(raw).map(normalizeProduct);
  } finally {
    timer.clear();
  }
}

export async function fetchHealth() {
  const timer = withTimeout(5000);
  try {
    const response = await fetch(`${API_BASE}/`, {
      headers: { Accept: "application/json" },
      signal: timer.signal,
    });
    if (!response.ok) throw new Error(`API ${response.status}`);
    return response.json();
  } finally {
    timer.clear();
  }
}
