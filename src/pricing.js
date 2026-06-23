export function formatEuro(value) {
  if (!Number.isFinite(value)) return "-";
  try {
    return new Intl.NumberFormat("el-GR", {
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

export function getBestProductPrice(product) {
  const values = Object.entries(product.prices || {})
    .filter(([, price]) => Number.isFinite(price))
    .map(([retailerId, price]) => ({ retailerId, price }));
  return values.sort((a, b) => a.price - b.price)[0] ?? null;
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
