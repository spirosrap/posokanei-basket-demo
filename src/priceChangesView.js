export const PRICE_CHANGE_DIRECTIONS = ["all", "decrease", "increase"];
export const PRICE_CHANGE_SORTS = ["recent", "percentage", "amount", "name"];

function cleanText(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function searchableText(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR");
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeChange(change) {
  const productId = cleanText(change?.product_id, 160);
  const productName = cleanText(change?.product_name);
  const retailerId = cleanText(change?.retailer_id, 160);
  const retailerName = cleanText(change?.retailer_name, 240);
  const previousPrice = finiteNumber(change?.previous_price);
  const currentPrice = finiteNumber(change?.current_price);
  const amount = finiteNumber(change?.amount);
  const percentage = finiteNumber(change?.percentage);
  const changedAt = cleanText(change?.changed_at, 80);
  const changedAtMs = Date.parse(changedAt);
  const direction = amount < 0 ? "decrease" : amount > 0 ? "increase" : "";

  if (
    !productId
    || !productName
    || !retailerId
    || !retailerName
    || previousPrice === null
    || currentPrice === null
    || previousPrice <= 0
    || currentPrice <= 0
    || amount === null
    || percentage === null
    || !direction
    || direction !== change?.direction
    || !Number.isFinite(changedAtMs)
    || Math.abs((previousPrice + amount) - currentPrice) >= 0.011
  ) {
    throw new Error("invalid_price_change");
  }

  return {
    productId,
    productName,
    brand: cleanText(change?.brand, 240),
    category: cleanText(change?.category, 240),
    imageUrl: cleanText(change?.image_url, 1200),
    retailerId,
    retailerName,
    previousPrice,
    currentPrice,
    amount,
    percentage,
    direction,
    changedAt,
    changedAtMs,
    comparedAt: cleanText(change?.compared_at, 80),
    offerUpdatedAt: cleanText(change?.offer_updated_at, 80),
  };
}

export function normalizePriceChangesPayload(raw) {
  if (
    raw?.schema_version !== 1
    || !Array.isArray(raw?.changes)
    || raw.changes.length > 10000
  ) {
    throw new Error("invalid_price_changes_payload");
  }

  const changes = raw.changes.map(normalizeChange);
  const productIds = new Set(changes.map((change) => change.productId));
  const retailerIds = new Set(changes.map((change) => change.retailerId));

  return {
    generatedAt: cleanText(raw.generated_at, 80),
    retentionDays: Math.max(0, Number(raw.retention_days) || 0),
    catalogProducts: Math.max(0, Number(raw?.stats?.catalog_products) || 0),
    stats: {
      changes: changes.length,
      products: productIds.size,
      retailers: retailerIds.size,
      decreases: changes.filter((change) => change.direction === "decrease").length,
      increases: changes.filter((change) => change.direction === "increase").length,
    },
    changes,
  };
}

export function priceChangeRetailers(changes) {
  return [...new Map(
    changes.map((change) => [change.retailerId, {
      id: change.retailerId,
      name: change.retailerName,
    }]),
  ).values()].sort((left, right) => left.name.localeCompare(right.name, "el"));
}

export function filterPriceChanges(
  changes,
  { query = "", retailerId = "all", direction = "all", sort = "recent" } = {},
) {
  const normalizedQuery = searchableText(query);
  const safeDirection = PRICE_CHANGE_DIRECTIONS.includes(direction) ? direction : "all";
  const safeSort = PRICE_CHANGE_SORTS.includes(sort) ? sort : "recent";
  const filtered = changes.filter((change) => {
    if (retailerId !== "all" && change.retailerId !== retailerId) return false;
    if (safeDirection !== "all" && change.direction !== safeDirection) return false;
    if (!normalizedQuery) return true;
    return searchableText([
      change.productName,
      change.brand,
      change.category,
      change.retailerName,
    ].join(" ")).includes(normalizedQuery);
  });

  return filtered.sort((left, right) => {
    if (safeSort === "percentage") {
      return Math.abs(right.percentage) - Math.abs(left.percentage)
        || right.changedAtMs - left.changedAtMs;
    }
    if (safeSort === "amount") {
      return Math.abs(right.amount) - Math.abs(left.amount)
        || right.changedAtMs - left.changedAtMs;
    }
    if (safeSort === "name") {
      return left.productName.localeCompare(right.productName, "el")
        || left.retailerName.localeCompare(right.retailerName, "el");
    }
    return right.changedAtMs - left.changedAtMs
      || Math.abs(right.amount) - Math.abs(left.amount);
  });
}
