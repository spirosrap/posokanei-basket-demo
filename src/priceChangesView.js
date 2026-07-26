export const PRICE_CHANGE_DIRECTIONS = ["all", "decrease", "increase"];
export const PRICE_CHANGE_SORTS = ["recent", "percentage", "amount", "name"];
const MAX_PRICE_CHANGES = 50000;
const MAX_COMPACT_PRODUCTS = 25000;
const MAX_COMPACT_RETAILERS = 200;
const MAX_HISTORY_POINTS = 200;
const MAX_HISTORY_SERIES = 30;

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

function normalizeHistoryPoint(point) {
  if (!Array.isArray(point) || point.length !== 2) {
    throw new Error("invalid_price_history_point");
  }
  const observedAt = cleanText(point[0], 80);
  const observedAtMs = Date.parse(observedAt);
  const price = finiteNumber(point[1]);
  if (!Number.isFinite(observedAtMs) || price === null || price <= 0) {
    throw new Error("invalid_price_history_point");
  }
  return { observedAt, observedAtMs, price };
}

function normalizeHistoryRecord(productId, history) {
  const recordProductId = cleanText(history?.product_id, 160);
  if (
    !productId
    || recordProductId !== productId
    || !Array.isArray(history?.retailers)
    || history.retailers.length > MAX_HISTORY_SERIES
  ) {
    throw new Error("invalid_price_history");
  }

  const retailers = history.retailers.map((series) => {
    const retailerId = cleanText(series?.retailer_id, 160);
    const retailerName = cleanText(series?.retailer_name, 240);
    if (
      !retailerId
      || !retailerName
      || !Array.isArray(series?.points)
      || !series.points.length
      || series.points.length > MAX_HISTORY_POINTS
    ) {
      throw new Error("invalid_price_history_series");
    }
    const points = series.points
      .map(normalizeHistoryPoint)
      .sort((left, right) => left.observedAtMs - right.observedAtMs);
    return {
      retailerId,
      retailerName,
      retailerLogoUrl: cleanText(series?.retailer_logo_url, 1200),
      points,
    };
  });

  return {
    productId,
    productName: cleanText(history?.product_name),
    imageUrl: cleanText(history?.image_url, 1200),
    retailers,
  };
}

function normalizeHistories(rawHistories) {
  if (rawHistories === undefined) return {};
  if (!rawHistories || typeof rawHistories !== "object" || Array.isArray(rawHistories)) {
    throw new Error("invalid_price_histories");
  }
  const entries = Object.entries(rawHistories);
  if (entries.length > 10000) throw new Error("invalid_price_histories");
  return Object.fromEntries(entries.map(([productIdValue, history]) => {
    const productId = cleanText(productIdValue, 160);
    return [productId, normalizeHistoryRecord(productId, history)];
  }));
}

function normalizeCompactChanges(raw) {
  const productEntries = Object.entries(raw?.products || {});
  const retailerEntries = Object.entries(raw?.retailers || {});
  if (
    !raw?.products
    || typeof raw.products !== "object"
    || Array.isArray(raw.products)
    || productEntries.length > MAX_COMPACT_PRODUCTS
    || !raw?.retailers
    || typeof raw.retailers !== "object"
    || Array.isArray(raw.retailers)
    || retailerEntries.length > MAX_COMPACT_RETAILERS
  ) {
    throw new Error("invalid_compact_price_changes");
  }

  const products = new Map(productEntries.map(([productIdValue, product]) => {
    const productId = cleanText(productIdValue, 160);
    if (
      !productId
      || !Array.isArray(product)
      || product.length !== 4
      || product.some((field) => typeof field !== "string")
    ) {
      throw new Error("invalid_compact_price_change_product");
    }
    return [productId, {
      productName: product[0],
      brand: product[1],
      category: product[2],
      imageUrl: product[3],
    }];
  }));
  const retailers = new Map(retailerEntries.map(([retailerIdValue, retailerName]) => {
    const retailerId = cleanText(retailerIdValue, 160);
    const name = cleanText(retailerName, 240);
    if (!retailerId || !name) {
      throw new Error("invalid_compact_price_change_retailer");
    }
    return [retailerId, name];
  }));

  return raw.changes.map((change) => {
    if (!Array.isArray(change) || change.length !== 10) {
      throw new Error("invalid_compact_price_change");
    }
    const productId = cleanText(change[0], 160);
    const retailerId = cleanText(change[1], 160);
    const product = products.get(productId);
    const retailerName = retailers.get(retailerId);
    if (!product || !retailerName || ![-1, 1].includes(change[6])) {
      throw new Error("invalid_compact_price_change");
    }
    return normalizeChange({
      product_id: productId,
      product_name: product.productName,
      brand: product.brand,
      category: product.category,
      image_url: product.imageUrl,
      retailer_id: retailerId,
      retailer_name: retailerName,
      previous_price: change[2],
      current_price: change[3],
      amount: change[4],
      percentage: change[5],
      direction: change[6] === -1 ? "decrease" : "increase",
      changed_at: change[7],
      compared_at: change[8],
      offer_updated_at: change[9],
    });
  });
}

export function normalizePriceChangesPayload(raw) {
  if (
    ![1, 2].includes(raw?.schema_version)
    || !Array.isArray(raw?.changes)
    || raw.changes.length > MAX_PRICE_CHANGES
  ) {
    throw new Error("invalid_price_changes_payload");
  }

  const changes = raw.schema_version === 2
    ? normalizeCompactChanges(raw)
    : raw.changes.map(normalizeChange);
  const productIds = new Set(changes.map((change) => change.productId));
  const retailerIds = new Set(changes.map((change) => change.retailerId));
  const partial = raw.partial === true;
  const histories = raw.schema_version === 1
    ? normalizeHistories(raw.histories)
    : {};
  const retailers = raw.schema_version === 2
    ? Object.entries(raw.retailers).map(([id, name]) => ({
        id: cleanText(id, 160),
        name: cleanText(name, 240),
      }))
    : [...new Map(changes.map((change) => [change.retailerId, {
        id: change.retailerId,
        name: change.retailerName,
      }])).values()];
  retailers.sort((left, right) => left.name.localeCompare(right.name, "el"));
  const observedStats = {
    changes: changes.length,
    products: productIds.size,
    retailers: retailerIds.size,
    decreases: changes.filter((change) => change.direction === "decrease").length,
    increases: changes.filter((change) => change.direction === "increase").length,
  };
  const reportedStat = (key) => {
    if (!partial) return observedStats[key];
    const reported = Math.floor(Number(raw?.stats?.[key]));
    return Number.isFinite(reported) && reported >= observedStats[key]
      ? reported
      : observedStats[key];
  };

  return {
    generatedAt: cleanText(raw.generated_at, 80),
    retentionDays: Math.max(0, Number(raw.retention_days) || 0),
    catalogProducts: Math.max(0, Number(raw?.stats?.catalog_products) || 0),
    stats: {
      changes: reportedStat("changes"),
      products: reportedStat("products"),
      retailers: reportedStat("retailers"),
      decreases: reportedStat("decreases"),
      increases: reportedStat("increases"),
      historyProducts: Object.keys(histories).length,
    },
    changes,
    histories,
    partial,
    retailers,
  };
}

export function priceHistoryForProduct(histories, changes, productId) {
  const saved = histories?.[productId];
  if (saved?.retailers?.length) return saved;
  const matching = changes.filter((change) => change.productId === productId);
  if (!matching.length) return null;
  const first = matching[0];
  const retailers = matching.map((change) => {
    const changedAtMs = change.changedAtMs;
    const comparedAtMs = Date.parse(change.comparedAt);
    const previousAtMs = Number.isFinite(comparedAtMs)
      ? comparedAtMs
      : changedAtMs - 1;
    return {
      retailerId: change.retailerId,
      retailerName: change.retailerName,
      retailerLogoUrl: "",
      points: [
        {
          observedAt: new Date(previousAtMs).toISOString(),
          observedAtMs: previousAtMs,
          price: change.previousPrice,
        },
        {
          observedAt: change.changedAt,
          observedAtMs: changedAtMs,
          price: change.currentPrice,
        },
      ],
    };
  });
  return {
    productId,
    productName: first.productName,
    imageUrl: first.imageUrl,
    retailers,
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
