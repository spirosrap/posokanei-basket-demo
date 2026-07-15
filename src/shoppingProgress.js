export const SHOPPING_PROGRESS_KEY = "posokanei-shopping-progress";

export function buildShoppingPlanId(plan) {
  if (!plan?.isComplete || !plan.groups?.length) return "";
  return plan.groups
    .map((group) => {
      const items = group.items
        .map((item) => `${item.product.id}:${item.quantity}`)
        .sort()
        .join(",");
      return `${group.retailer.id}:${items}`;
    })
    .sort()
    .join("|");
}

export function shoppingItemId(retailerId, productId) {
  return `${retailerId}:${productId}`;
}

export function summarizeShoppingPlan(plan, checkedIds = []) {
  const checked = new Set(Array.isArray(checkedIds) ? checkedIds : []);
  const groups = (plan?.groups || []).map((group) => {
    const items = group.items || [];
    const itemIds = items.map((item) =>
      shoppingItemId(group.retailer.id, item.product.id),
    );
    const completedCount = itemIds.filter((itemId) => checked.has(itemId)).length;
    const remainingItems = items.filter((item, index) => !checked.has(itemIds[index]));
    return {
      retailerId: group.retailer.id,
      itemIds,
      completedCount,
      totalCount: items.length,
      remainingItems,
      remainingTotal: remainingItems.reduce(
        (total, item) => total + (Number(item.lineTotal) || 0),
        0,
      ),
      isComplete: items.length > 0 && completedCount === items.length,
    };
  });
  const validItemIds = new Set(groups.flatMap((group) => group.itemIds));
  const completedCount = [...checked].filter((itemId) => validItemIds.has(itemId)).length;
  const totalCount = validItemIds.size;
  const remainingTotal = groups.reduce((total, group) => total + group.remainingTotal, 0);

  return {
    groups,
    completedCount,
    totalCount,
    remainingTotal,
    isComplete: totalCount > 0 && completedCount === totalCount,
  };
}

export function buildRemainingShoppingPlan(plan, summary) {
  if (!plan?.isComplete || !summary?.groups) return null;
  const incompleteRetailers = new Set(
    summary.groups
      .filter((group) => !group.isComplete)
      .map((group) => group.retailerId),
  );
  const groups = plan.groups.filter((group) => incompleteRetailers.has(group.retailer.id));
  if (!groups.length) return null;
  return {
    ...plan,
    groups,
    chainCount: groups.length,
    total: summary.remainingTotal,
  };
}

export function loadShoppingProgress(planId) {
  if (!planId) return [];
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem(SHOPPING_PROGRESS_KEY) || "null");
    if (stored?.planId !== planId || !Array.isArray(stored.checkedIds)) return [];
    return [...new Set(stored.checkedIds.filter((id) => typeof id === "string"))];
  } catch {
    return [];
  }
}

export function saveShoppingProgress(planId, checkedIds) {
  if (!planId) return;
  try {
    globalThis.localStorage?.setItem(
      SHOPPING_PROGRESS_KEY,
      JSON.stringify({
        planId,
        checkedIds: [...new Set(checkedIds)],
      }),
    );
  } catch {
    // The checklist remains usable when strict browser storage rejects writes.
  }
}
