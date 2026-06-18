export function formatEuro(value) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("el-GR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value);
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

export function calculateSplitBest(basket, products, retailers) {
  const productMap = new Map(products.map((product) => [product.id, product]));
  const retailerMap = new Map(retailers.map((retailer) => [retailer.id, retailer]));
  const items = basket
    .map((entry) => {
      const product = productMap.get(entry.productId);
      const best = product ? getBestProductPrice(product) : null;
      return best
        ? {
            product,
            quantity: entry.quantity,
            retailer: retailerMap.get(best.retailerId),
            price: best.price,
            lineTotal: best.price * entry.quantity,
          }
        : null;
    })
    .filter(Boolean);

  return {
    items,
    total: items.reduce((sum, item) => sum + item.lineTotal, 0),
  };
}

export function basketItemCount(basket) {
  return basket.reduce((sum, entry) => sum + entry.quantity, 0);
}
