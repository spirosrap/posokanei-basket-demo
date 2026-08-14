export const DEFAULT_MAX_CATALOG_DROP_RATIO = 0.03;
export const DEFAULT_CONTRACTION_CONFIRMATIONS = 2;
export const DEFAULT_CONTRACTION_TOLERANCE_RATIO = 0.01;

export function evaluateCatalogContraction({
  previousCount,
  nextCount,
  pendingState = null,
  maximumDropRatio = DEFAULT_MAX_CATALOG_DROP_RATIO,
  requiredConfirmations = DEFAULT_CONTRACTION_CONFIRMATIONS,
  toleranceRatio = DEFAULT_CONTRACTION_TOLERANCE_RATIO,
}) {
  const previous = normalizeCount(previousCount);
  const next = normalizeCount(nextCount);
  const maximumDrop = normalizeRatio(maximumDropRatio, DEFAULT_MAX_CATALOG_DROP_RATIO);
  const confirmationsRequired = Math.max(1, normalizeCount(requiredConfirmations) || 1);
  const tolerance = normalizeRatio(
    toleranceRatio,
    DEFAULT_CONTRACTION_TOLERANCE_RATIO,
  );

  if (!previous || !next || next >= previous) {
    return publicationAllowed("normal", previous, next, 0);
  }

  const dropRatio = (previous - next) / previous;
  if (dropRatio <= maximumDrop) {
    return publicationAllowed("within-threshold", previous, next, dropRatio);
  }

  const pendingPrevious = normalizeCount(pendingState?.previous_product_count);
  const pendingNext = normalizeCount(pendingState?.product_count);
  const sameBaseline = pendingPrevious === previous;
  const candidateDrift = pendingNext
    ? Math.abs(next - pendingNext) / pendingNext
    : Number.POSITIVE_INFINITY;
  const sameContraction = sameBaseline && candidateDrift <= tolerance;
  const confirmations = sameContraction
    ? Math.max(1, normalizeCount(pendingState?.confirmations)) + 1
    : 1;

  if (confirmations >= confirmationsRequired) {
    return {
      ...publicationAllowed("confirmed-contraction", previous, next, dropRatio),
      confirmations,
    };
  }

  return {
    allow: false,
    reason: "confirmation-required",
    previousCount: previous,
    nextCount: next,
    dropRatio,
    confirmations,
    nextState: {
      previous_product_count: previous,
      product_count: next,
      confirmations,
    },
  };
}

function publicationAllowed(reason, previousCount, nextCount, dropRatio) {
  return {
    allow: true,
    reason,
    previousCount,
    nextCount,
    dropRatio,
    confirmations: 0,
    nextState: null,
  };
}

function normalizeCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function normalizeRatio(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number < 1 ? number : fallback;
}
