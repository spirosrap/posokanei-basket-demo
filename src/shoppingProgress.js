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
