export const SHOPPING_BUDGET_KEY = "posokanei-shopping-budget";
const MAX_SHOPPING_BUDGET = 100000;

export function normalizeShoppingBudget(value) {
  if (value === "" || value === null || value === undefined) return null;
  const amount = Number(String(value).replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_SHOPPING_BUDGET) return null;
  return Math.round(amount * 100) / 100;
}

export function loadShoppingBudget(storage = globalThis.localStorage) {
  try {
    return normalizeShoppingBudget(storage?.getItem(SHOPPING_BUDGET_KEY));
  } catch {
    return null;
  }
}

export function persistShoppingBudget(value, storage = globalThis.localStorage) {
  const budget = normalizeShoppingBudget(value);
  try {
    if (budget == null) storage?.removeItem(SHOPPING_BUDGET_KEY);
    else storage?.setItem(SHOPPING_BUDGET_KEY, String(budget));
  } catch {
    // The budget remains usable in memory when strict storage rejects writes.
  }
  return budget;
}

export function shoppingBudgetStatus(total, value) {
  const budget = normalizeShoppingBudget(value);
  const amount = total === null || total === undefined || total === "" ? Number.NaN : Number(total);
  if (budget == null || !Number.isFinite(amount) || amount < 0) {
    return { state: "unset", budget, total: Number.isFinite(amount) ? amount : null };
  }

  const difference = Math.round((budget - amount) * 100) / 100;
  const ratio = budget > 0 ? amount / budget : 0;
  return {
    state: difference < 0 ? "over" : ratio >= 0.9 ? "near" : "under",
    budget,
    total: amount,
    difference,
    progress: Math.min(100, Math.max(0, ratio * 100)),
  };
}
