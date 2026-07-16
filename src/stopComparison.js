import { calculateVisitPlan } from "./pricing.js";

export const EXTRA_STOP_COST_KEY = "posokanei-extra-stop-cost";
export const EXTRA_STOP_COST_OPTIONS = [0, 2, 5, 10];

export function normalizeExtraStopCost(value) {
  const numericValue = Number(value);
  return EXTRA_STOP_COST_OPTIONS.includes(numericValue) ? numericValue : 0;
}

export function getInitialExtraStopCost() {
  try {
    return normalizeExtraStopCost(globalThis.localStorage?.getItem(EXTRA_STOP_COST_KEY));
  } catch {
    return 0;
  }
}

export function saveExtraStopCost(value) {
  try {
    globalThis.localStorage?.setItem(
      EXTRA_STOP_COST_KEY,
      String(normalizeExtraStopCost(value)),
    );
  } catch {
    // The comparison still works when strict browser storage rejects writes.
  }
}

export function calculateStopComparison(
  basket,
  products,
  retailers,
  extraStopCost = 0,
  maxStops = 4,
) {
  const normalizedCost = Math.max(0, Number(extraStopCost) || 0);
  const options = Array.from({ length: maxStops }, (_, index) => {
    const limit = index + 1;
    const plan = calculateVisitPlan(basket, products, retailers, limit);
    const actualStops = plan.isComplete ? plan.chainCount : 0;
    const estimatedExtraCost = plan.isComplete
      ? normalizedCost * Math.max(0, actualStops - 1)
      : null;

    return {
      limit,
      plan,
      isComplete: plan.isComplete,
      actualStops,
      groceryTotal: plan.isComplete ? plan.total : null,
      estimatedExtraCost,
      effectiveTotal: plan.isComplete ? plan.total + estimatedExtraCost : null,
    };
  });

  const oneStopTotal = options[0]?.groceryTotal ?? null;
  const enrichedOptions = options.map((option) => {
    const extraStops = Math.max(0, option.actualStops - 1);
    const savingsVsOneStop =
      oneStopTotal == null || option.groceryTotal == null
        ? null
        : Math.max(0, oneStopTotal - option.groceryTotal);

    return {
      ...option,
      extraStops,
      savingsVsOneStop,
      savingsPerExtraStop:
        savingsVsOneStop == null ? null : extraStops ? savingsVsOneStop / extraStops : 0,
      netSavingsVsOneStop:
      oneStopTotal == null || option.effectiveTotal == null
        ? null
        : oneStopTotal - option.effectiveTotal,
    };
  });
  const recommended = [...enrichedOptions]
    .filter((option) => option.isComplete)
    .sort((a, b) => {
      if (a.effectiveTotal !== b.effectiveTotal) return a.effectiveTotal - b.effectiveTotal;
      if (a.actualStops !== b.actualStops) return a.actualStops - b.actualStops;
      return a.limit - b.limit;
    })[0] ?? null;

  return {
    extraStopCost: normalizedCost,
    oneStopTotal,
    options: enrichedOptions,
    recommended,
  };
}
