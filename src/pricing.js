export function formatEuro(value, locale = "el-GR") {
  if (!Number.isFinite(value)) return "-";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2).replace(".", ",")} €`;
  }
}

export function getProductPrice(product, retailerId) {
  const value = product?.prices?.[retailerId];
  return Number.isFinite(value) ? value : null;
}

export function getProductPriceChange(product, retailerId) {
  const change = product?.priceChanges?.[retailerId];
  return change && Number.isFinite(change.amount) && Number.isFinite(change.previousPrice)
    ? change
    : null;
}

export function getBestProductPrice(product, retailerIds = null) {
  const allowedRetailers = Array.isArray(retailerIds) ? new Set(retailerIds) : null;
  const values = Object.entries(product.prices || {})
    .filter(([retailerId, price]) =>
      Number.isFinite(price) && (!allowedRetailers || allowedRetailers.has(retailerId)))
    .map(([retailerId, price]) => ({ retailerId, price }));
  return values.sort((a, b) => a.price - b.price)[0] ?? null;
}

export function getBestProductUnitPrice(product, retailerIds = null) {
  const allowedRetailers = Array.isArray(retailerIds) ? new Set(retailerIds) : null;
  const values = Object.entries(product.prices || {})
    .filter(([retailerId, price]) =>
      Number.isFinite(price) && (!allowedRetailers || allowedRetailers.has(retailerId)))
    .map(([retailerId, price]) => {
      const normalized = Number(product.unitPrices?.[retailerId]);
      const fallback = Number(product.unitAmount) > 0 ? price / Number(product.unitAmount) : null;
      const unitPrice = Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
      return Number.isFinite(unitPrice) && unitPrice > 0
        ? { retailerId, price, unitPrice }
        : null;
    })
    .filter(Boolean);
  return values.sort((a, b) => a.unitPrice - b.unitPrice || a.price - b.price)[0] ?? null;
}

export function sortProductsByBestPrice(products, retailerIds = null) {
  return products
    .map((product, index) => ({
      product,
      index,
      price: getBestProductPrice(product, retailerIds)?.price ?? null,
    }))
    .sort((left, right) => {
      if (left.price == null && right.price != null) return 1;
      if (left.price != null && right.price == null) return -1;
      if (left.price !== right.price) return (left.price ?? 0) - (right.price ?? 0);
      const nameOrder = left.product.name.localeCompare(right.product.name, "el");
      return nameOrder || left.index - right.index;
    })
    .map(({ product }) => product);
}

export function sortProductsByBestUnitPrice(products, retailerIds = null) {
  return products
    .map((product, index) => ({
      product,
      index,
      price: getBestProductUnitPrice(product, retailerIds)?.unitPrice ?? null,
    }))
    .sort((left, right) => compareProductSortRows(left, right))
    .map(({ product }) => product);
}

export function sortProducts(products, mode = "price", retailerIds = null) {
  if (mode === "name") {
    return [...products].sort((left, right) => left.name.localeCompare(right.name, "el"));
  }
  return mode === "unit_price"
    ? sortProductsByBestUnitPrice(products, retailerIds)
    : sortProductsByBestPrice(products, retailerIds);
}

function compareProductSortRows(left, right) {
  if (left.price == null && right.price != null) return 1;
  if (left.price != null && right.price == null) return -1;
  if (left.price !== right.price) return (left.price ?? 0) - (right.price ?? 0);
  const nameOrder = left.product.name.localeCompare(right.product.name, "el");
  return nameOrder || left.index - right.index;
}

export function calculateRankings(basket, products, retailers) {
  const productMap = new Map(products.map((product) => [product.id, product]));
  const rows = retailers.map((retailer) => {
    const items = basket.map((entry) => {
      const product = productMap.get(entry.productId);
      const price = getProductPrice(product, retailer.id);
      return {
        product,
        quantity: entry.quantity,
        price,
        lineTotal: price == null ? null : price * entry.quantity,
      };
    });
    const availableItems = items.filter((item) => item.price != null);
    const total = availableItems.reduce((sum, item) => sum + item.lineTotal, 0);

    return {
      retailer,
      items,
      total,
      availableCount: availableItems.length,
      missingCount: basket.length - availableItems.length,
      isComplete: basket.length > 0 && availableItems.length === basket.length,
    };
  });

  const sorted = rows.sort((a, b) => {
    if (a.isComplete !== b.isComplete) return a.isComplete ? -1 : 1;
    if (a.missingCount !== b.missingCount) return a.missingCount - b.missingCount;
    return a.total - b.total;
  });

  const completeTotals = sorted
    .filter((row) => row.isComplete)
    .map((row) => row.total);
  const maxComplete = Math.max(...completeTotals, 0);

  return sorted.map((row, index) => ({
    ...row,
    rank: index + 1,
    savings: row.isComplete ? maxComplete - row.total : null,
  }));
}

export function calculateVisitPlan(basket, products, retailers, maxChains) {
  const productMap = new Map(products.map((product) => [product.id, product]));
  const cappedMaxChains = Math.min(Math.max(maxChains, 1), retailers.length);
  const candidateCombos = [];
  for (let size = 1; size <= cappedMaxChains; size += 1) {
    candidateCombos.push(...getCombinations(retailers, size));
  }

  const evaluated = candidateCombos.map((combo) => evaluateRetailerCombo(basket, productMap, combo));
  const completePlans = evaluated.filter((plan) => plan.isComplete);
  const bestComplete = completePlans.sort(compareVisitPlans)[0] ?? null;
  const bestPartial =
    evaluated.sort((a, b) => {
      if (a.availableCount !== b.availableCount) return b.availableCount - a.availableCount;
      if (a.missingItems.length !== b.missingItems.length) {
        return a.missingItems.length - b.missingItems.length;
      }
      return compareVisitPlans(a, b);
    })[0] ?? null;

  return bestComplete ?? bestPartial ?? createEmptyVisitPlan(cappedMaxChains);
}

function evaluateRetailerCombo(basket, productMap, retailers) {
  const groups = new Map();
  const missingItems = [];
  let total = 0;
  let availableCount = 0;

  basket.forEach((entry) => {
    const product = productMap.get(entry.productId);
    const options = retailers
      .map((retailer) => {
        const price = getProductPrice(product, retailer.id);
        return price == null ? null : { retailer, price };
      })
      .filter(Boolean)
      .sort((a, b) => a.price - b.price);

    const best = options[0];
    if (!product || !best) {
      missingItems.push({ product, quantity: entry.quantity });
      return;
    }

    const lineTotal = best.price * entry.quantity;
    const group = groups.get(best.retailer.id) ?? {
      retailer: best.retailer,
      items: [],
      total: 0,
    };
    group.items.push({
      product,
      quantity: entry.quantity,
      price: best.price,
      lineTotal,
    });
    group.total += lineTotal;
    groups.set(best.retailer.id, group);
    total += lineTotal;
    availableCount += 1;
  });

  const sortedGroups = [...groups.values()].sort((a, b) => b.total - a.total);

  return {
    maxChains: retailers.length,
    retailers,
    chainCount: sortedGroups.length,
    groups: sortedGroups,
    total,
    availableCount,
    missingItems,
    isComplete: basket.length > 0 && missingItems.length === 0,
  };
}

function compareVisitPlans(a, b) {
  if (a.isComplete !== b.isComplete) return a.isComplete ? -1 : 1;
  if (a.total !== b.total) return a.total - b.total;
  if (a.chainCount !== b.chainCount) return a.chainCount - b.chainCount;
  return a.groups.map((group) => group.retailer.name).join(",").localeCompare(
    b.groups.map((group) => group.retailer.name).join(","),
    "el",
  );
}

function getCombinations(items, size, start = 0, prefix = []) {
  if (prefix.length === size) return [prefix];
  const combos = [];
  for (let index = start; index <= items.length - (size - prefix.length); index += 1) {
    combos.push(...getCombinations(items, size, index + 1, [...prefix, items[index]]));
  }
  return combos;
}

function createEmptyVisitPlan(maxChains) {
  return {
    maxChains,
    retailers: [],
    chainCount: 0,
    groups: [],
    total: 0,
    availableCount: 0,
    missingItems: [],
    isComplete: false,
  };
}

export function basketItemCount(basket) {
  return basket.reduce((sum, entry) => sum + entry.quantity, 0);
}
