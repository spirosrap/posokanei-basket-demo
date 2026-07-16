const SAVINGS_EPSILON = 0.005;

export function calculateSavingsBreakdown(plan, oneStopRanking, maxItems = 4) {
  if (!plan?.isComplete || !oneStopRanking?.isComplete) return null;

  const plannedItems = new Map();
  plan.groups.forEach((group) => {
    group.items.forEach((item) => {
      if (!item.product?.id) return;
      plannedItems.set(item.product.id, {
        ...item,
        retailer: group.retailer,
      });
    });
  });

  const comparisons = oneStopRanking.items
    .map((baselineItem) => {
      const productId = baselineItem.product?.id;
      const plannedItem = plannedItems.get(productId);
      if (!productId || !plannedItem || baselineItem.lineTotal == null) return null;

      return {
        product: baselineItem.product,
        quantity: baselineItem.quantity,
        baselineRetailer: oneStopRanking.retailer,
        plannedRetailer: plannedItem.retailer,
        baselineLineTotal: baselineItem.lineTotal,
        plannedLineTotal: plannedItem.lineTotal,
        savings: baselineItem.lineTotal - plannedItem.lineTotal,
      };
    })
    .filter(Boolean);

  const savingItems = comparisons
    .filter((item) => item.savings > SAVINGS_EPSILON)
    .sort((a, b) => b.savings - a.savings || a.product.name.localeCompare(b.product.name, "el"));
  const tradeoffItems = comparisons
    .filter((item) => item.savings < -SAVINGS_EPSILON)
    .sort((a, b) => a.savings - b.savings || a.product.name.localeCompare(b.product.name, "el"));
  const totalSavings = oneStopRanking.total - plan.total;

  if (totalSavings <= SAVINGS_EPSILON || !savingItems.length) return null;

  const visibleItems = savingItems.slice(0, Math.max(1, maxItems));
  const remainingSavings = savingItems
    .slice(visibleItems.length)
    .reduce((sum, item) => sum + item.savings, 0);

  return {
    baselineRetailer: oneStopRanking.retailer,
    totalSavings,
    grossSavings: savingItems.reduce((sum, item) => sum + item.savings, 0),
    tradeoffCost: Math.abs(tradeoffItems.reduce((sum, item) => sum + item.savings, 0)),
    savingItemCount: savingItems.length,
    tradeoffItemCount: tradeoffItems.length,
    visibleItems,
    remainingItemCount: Math.max(0, savingItems.length - visibleItems.length),
    remainingSavings,
  };
}
