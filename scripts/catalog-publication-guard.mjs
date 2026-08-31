export const DEFAULT_MAX_CATALOG_DROP_RATIO = 0.03;
export const DEFAULT_CONTRACTION_CONFIRMATIONS = 2;
export const DEFAULT_CONTRACTION_TOLERANCE_RATIO = 0.01;
export const DEFAULT_MAX_ROOT_DROP_RATIO = 0.05;
export const DEFAULT_MAX_RETAILER_DROP_RATIO = 0.2;
export const DEFAULT_MAX_OFFER_DROP_RATIO = 0.08;
export const DEFAULT_MIN_ROOT_DROP = 10;
export const DEFAULT_MIN_RETAILER_BASELINE = 100;
export const DEFAULT_MIN_RETAILER_DROP = 50;
export const DEFAULT_MIN_OFFER_DROP = 100;
export const DEFAULT_COVERAGE_CONFIRMATIONS = 6;
export const DEFAULT_COVERAGE_CONFIRMATION_MIN_AGE_MS = 6 * 60 * 60 * 1000;
export const DEFAULT_COVERAGE_CONFIRMATION_TOLERANCE_RATIO = 0.01;

export function evaluateCatalogContraction({
  previousCount,
  nextCount,
  pendingState = null,
  maximumDropRatio = DEFAULT_MAX_CATALOG_DROP_RATIO,
  requiredConfirmations = DEFAULT_CONTRACTION_CONFIRMATIONS,
  toleranceRatio = DEFAULT_CONTRACTION_TOLERANCE_RATIO,
  allowConfirmedContraction = false,
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
    if (!allowConfirmedContraction) {
      return {
        allow: false,
        reason: "manual-approval-required",
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

export function buildCatalogCoverageProfile(snapshot = {}) {
  const products = Array.isArray(snapshot?.products) ? snapshot.products : [];
  const categories = Array.isArray(snapshot?.categories) ? snapshot.categories : [];
  const retailerNames = new Map(
    (Array.isArray(snapshot?.retailers) ? snapshot.retailers : [])
      .map((retailer) => [
        normalizeId(retailer?.id || retailer?.retailer),
        String(retailer?.name || retailer?.retailer_display_name || "").trim(),
      ])
      .filter(([id]) => id),
  );
  const retailerCounts = new Map();
  let totalOffers = 0;

  for (const product of products) {
    const productRetailers = new Set();
    for (const offer of Array.isArray(product?.retailer_prices) ? product.retailer_prices : []) {
      if (String(offer?.country || "GR").toUpperCase() !== "GR") continue;
      const id = normalizeId(offer?.retailer || offer?.retailer_id);
      if (!id || productRetailers.has(id)) continue;
      productRetailers.add(id);
      retailerCounts.set(id, (retailerCounts.get(id) || 0) + 1);
      if (!retailerNames.has(id)) {
        retailerNames.set(
          id,
          String(offer?.retailer_display_name || offer?.retailer_name || id).trim(),
        );
      }
    }
    totalOffers += productRetailers.size;
  }

  const configuredRoots = Array.isArray(snapshot?.coverage?.root_categories)
    ? snapshot.coverage.root_categories
    : categories.filter((category) => Number(category?.depth) === 0);
  const rootCategories = configuredRoots
    .map((category) => ({
      id: normalizeId(category?.id || category?.category_id),
      name: String(category?.name || category?.category_name || "").trim(),
      product_count: normalizeCount(category?.product_count ?? category?.count),
    }))
    .filter((category) => category.id && category.product_count)
    .sort((left, right) => left.id.localeCompare(right.id));
  const retailers = [...retailerCounts.entries()]
    .map(([id, productCount]) => ({
      id,
      name: retailerNames.get(id) || id,
      product_count: productCount,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    generated_at: String(snapshot?.generated_at || ""),
    product_count: products.length,
    category_count: categories.length,
    total_offers: totalOffers,
    root_categories: rootCategories,
    retailers,
  };
}

export function evaluateCatalogCoverage({
  previousSnapshot,
  nextSnapshot,
  previousProfile = buildCatalogCoverageProfile(previousSnapshot),
  nextProfile = buildCatalogCoverageProfile(nextSnapshot),
  maximumRootDropRatio = DEFAULT_MAX_ROOT_DROP_RATIO,
  maximumRetailerDropRatio = DEFAULT_MAX_RETAILER_DROP_RATIO,
  maximumOfferDropRatio = DEFAULT_MAX_OFFER_DROP_RATIO,
  minimumRootDrop = DEFAULT_MIN_ROOT_DROP,
  minimumRetailerBaseline = DEFAULT_MIN_RETAILER_BASELINE,
  minimumRetailerDrop = DEFAULT_MIN_RETAILER_DROP,
  minimumOfferDrop = DEFAULT_MIN_OFFER_DROP,
} = {}) {
  const anomalies = [];
  compareCoverageEntries({
    scope: "root_category",
    previousEntries: previousProfile.root_categories,
    nextEntries: nextProfile.root_categories,
    maximumDropRatio: normalizeRatio(maximumRootDropRatio, DEFAULT_MAX_ROOT_DROP_RATIO),
    minimumBaseline: 1,
    minimumDrop: normalizeCount(minimumRootDrop),
    anomalies,
  });
  compareCoverageEntries({
    scope: "retailer",
    previousEntries: previousProfile.retailers,
    nextEntries: nextProfile.retailers,
    maximumDropRatio: normalizeRatio(
      maximumRetailerDropRatio,
      DEFAULT_MAX_RETAILER_DROP_RATIO,
    ),
    minimumBaseline: normalizeCount(minimumRetailerBaseline),
    minimumDrop: normalizeCount(minimumRetailerDrop),
    anomalies,
  });

  const previousOffers = normalizeCount(previousProfile.total_offers);
  const nextOffers = normalizeCount(nextProfile.total_offers);
  const offerDrop = Math.max(0, previousOffers - nextOffers);
  const offerDropRatio = previousOffers ? offerDrop / previousOffers : 0;
  if (
    previousOffers
    && offerDrop >= normalizeCount(minimumOfferDrop)
    && offerDropRatio > normalizeRatio(maximumOfferDropRatio, DEFAULT_MAX_OFFER_DROP_RATIO)
  ) {
    anomalies.push({
      scope: "offers",
      id: "all",
      name: "Active retailer offers",
      previous_count: previousOffers,
      next_count: nextOffers,
      drop: offerDrop,
      drop_ratio: offerDropRatio,
    });
  }

  return {
    allow: anomalies.length === 0,
    reason: anomalies.length ? "coverage-degraded" : "coverage-healthy",
    anomalies,
    previousProfile,
    nextProfile,
  };
}

export function evaluateCoverageBaselineConfirmation({
  coverageAssessment,
  pendingState = null,
  requiredConfirmations = DEFAULT_COVERAGE_CONFIRMATIONS,
  minimumAgeMs = DEFAULT_COVERAGE_CONFIRMATION_MIN_AGE_MS,
  toleranceRatio = DEFAULT_COVERAGE_CONFIRMATION_TOLERANCE_RATIO,
  observedAt = new Date().toISOString(),
  approvedRetailerBaselines = {},
} = {}) {
  const anomalies = Array.isArray(coverageAssessment?.anomalies)
    ? coverageAssessment.anomalies
    : [];
  if (coverageAssessment?.allow) {
    return coverageBaselineAllowed("coverage-healthy");
  }
  if (!coverageAssessment || !anomalies.length) {
    return coverageBaselineBlocked("coverage-not-confirmable");
  }

  const retailerOnly = anomalies.every(
    (anomaly) => anomaly?.scope === "retailer" && normalizeCount(anomaly?.next_count) > 0,
  );
  if (!retailerOnly) {
    return {
      ...coverageBaselineBlocked("coverage-not-confirmable"),
      nextState: null,
    };
  }

  const approvals = normalizeRetailerBaselineApprovals(approvedRetailerBaselines);
  const explicitlyApproved = approvals.size > 0 && anomalies.every(
    (anomaly) => approvals.get(normalizeId(anomaly?.id)) === normalizeCount(anomaly?.next_count),
  );
  if (explicitlyApproved) {
    return coverageBaselineAllowed("approved-retailer-baseline");
  }

  const required = Math.max(
    1,
    normalizeCount(requiredConfirmations) || DEFAULT_COVERAGE_CONFIRMATIONS,
  );
  const minimumAge = normalizeNonNegativeNumber(
    minimumAgeMs,
    DEFAULT_COVERAGE_CONFIRMATION_MIN_AGE_MS,
  );
  const tolerance = normalizeRatio(
    toleranceRatio,
    DEFAULT_COVERAGE_CONFIRMATION_TOLERANCE_RATIO,
  );
  const observedAtMs = normalizeTimestamp(observedAt);
  const observedAtIso = new Date(observedAtMs).toISOString();
  const candidateState = coverageConfirmationState(coverageAssessment, anomalies);
  const sameCandidate = matchesCoverageConfirmationState(
    pendingState,
    candidateState,
    tolerance,
  );
  const confirmations = sameCandidate
    ? Math.max(1, normalizeCount(pendingState?.confirmations)) + 1
    : 1;
  const firstSeenAt = sameCandidate && normalizeTimestamp(pendingState?.first_seen_at, 0)
    ? new Date(normalizeTimestamp(pendingState.first_seen_at)).toISOString()
    : observedAtIso;
  const observedForMs = Math.max(0, observedAtMs - normalizeTimestamp(firstSeenAt));
  const nextState = {
    ...candidateState,
    confirmations,
    first_seen_at: firstSeenAt,
    last_seen_at: observedAtIso,
  };

  if (confirmations >= required && observedForMs >= minimumAge) {
    return {
      ...coverageBaselineAllowed("confirmed-retailer-baseline"),
      confirmations,
      requiredConfirmations: required,
      observedForMs,
      minimumAgeMs: minimumAge,
    };
  }

  return {
    allow: false,
    reason: "retailer-baseline-confirmation-required",
    confirmations,
    requiredConfirmations: required,
    observedForMs,
    minimumAgeMs: minimumAge,
    nextState,
  };
}

export function parseRetailerBaselineApprovals(value) {
  const approvals = new Map();
  const tokens = String(value || "")
    .split(/[,\s]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
  for (const token of tokens) {
    const match = /^([^:]+):(\d+)$/u.exec(token);
    if (!match || !normalizeId(match[1]) || !normalizeCount(match[2])) {
      throw new Error(
        `Invalid retailer baseline approval "${token}"; expected retailer_id:positive_count.`,
      );
    }
    approvals.set(normalizeId(match[1]), normalizeCount(match[2]));
  }
  return approvals;
}

function compareCoverageEntries({
  scope,
  previousEntries,
  nextEntries,
  maximumDropRatio,
  minimumBaseline,
  minimumDrop,
  anomalies,
}) {
  const nextById = new Map(
    (Array.isArray(nextEntries) ? nextEntries : []).map((entry) => [entry.id, entry]),
  );
  for (const previousEntry of Array.isArray(previousEntries) ? previousEntries : []) {
    const previousCount = normalizeCount(previousEntry?.product_count);
    if (previousCount < minimumBaseline) continue;
    const nextEntry = nextById.get(previousEntry.id);
    const nextCount = normalizeCount(nextEntry?.product_count);
    const drop = Math.max(0, previousCount - nextCount);
    const dropRatio = previousCount ? drop / previousCount : 0;
    if (drop < minimumDrop || dropRatio <= maximumDropRatio) continue;
    anomalies.push({
      scope,
      id: previousEntry.id,
      name: previousEntry.name || nextEntry?.name || previousEntry.id,
      previous_count: previousCount,
      next_count: nextCount,
      drop,
      drop_ratio: dropRatio,
    });
  }
}

function coverageConfirmationState(coverageAssessment, anomalies) {
  const previousProfile = coverageAssessment?.previousProfile || {};
  const nextProfile = coverageAssessment?.nextProfile || {};
  return {
    previous_generated_at: String(previousProfile.generated_at || ""),
    previous_product_count: normalizeCount(previousProfile.product_count),
    candidate_product_count: normalizeCount(nextProfile.product_count),
    candidate_category_count: normalizeCount(nextProfile.category_count),
    candidate_total_offers: normalizeCount(nextProfile.total_offers),
    anomalies: anomalies
      .map((anomaly) => ({
        scope: String(anomaly?.scope || ""),
        id: normalizeId(anomaly?.id),
        previous_count: normalizeCount(anomaly?.previous_count),
        next_count: normalizeCount(anomaly?.next_count),
      }))
      .sort((left, right) => `${left.scope}:${left.id}`.localeCompare(`${right.scope}:${right.id}`)),
  };
}

function matchesCoverageConfirmationState(pendingState, candidateState, tolerance) {
  if (!pendingState || pendingState.previous_generated_at !== candidateState.previous_generated_at) {
    return false;
  }
  if (
    normalizeCount(pendingState.previous_product_count)
    !== candidateState.previous_product_count
  ) {
    return false;
  }
  if (
    normalizeCount(pendingState.candidate_category_count)
    !== candidateState.candidate_category_count
  ) {
    return false;
  }
  if (
    !countsWithinTolerance(
      pendingState.candidate_product_count,
      candidateState.candidate_product_count,
      tolerance,
    )
    || !countsWithinTolerance(
      pendingState.candidate_total_offers,
      candidateState.candidate_total_offers,
      tolerance,
    )
  ) {
    return false;
  }

  const pendingAnomalies = Array.isArray(pendingState.anomalies)
    ? pendingState.anomalies
    : [];
  if (pendingAnomalies.length !== candidateState.anomalies.length) return false;
  return candidateState.anomalies.every((candidateAnomaly, index) => {
    const pendingAnomaly = pendingAnomalies[index] || {};
    return pendingAnomaly.scope === candidateAnomaly.scope
      && normalizeId(pendingAnomaly.id) === candidateAnomaly.id
      && normalizeCount(pendingAnomaly.previous_count) === candidateAnomaly.previous_count
      && countsWithinTolerance(
        pendingAnomaly.next_count,
        candidateAnomaly.next_count,
        tolerance,
      );
  });
}

function countsWithinTolerance(previousValue, nextValue, tolerance) {
  const previous = normalizeCount(previousValue);
  const next = normalizeCount(nextValue);
  if (!previous || !next) return previous === next;
  return Math.abs(next - previous) / previous <= tolerance;
}

function normalizeRetailerBaselineApprovals(value) {
  if (value instanceof Map) return value;
  return new Map(
    Object.entries(value || {})
      .map(([id, count]) => [normalizeId(id), normalizeCount(count)])
      .filter(([id, count]) => id && count),
  );
}

function coverageBaselineAllowed(reason) {
  return {
    allow: true,
    reason,
    confirmations: 0,
    nextState: null,
  };
}

function coverageBaselineBlocked(reason) {
  return {
    allow: false,
    reason,
    confirmations: 0,
    requiredConfirmations: 0,
    observedForMs: 0,
    minimumAgeMs: 0,
    nextState: null,
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

function normalizeId(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeRatio(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number < 1 ? number : fallback;
}

function normalizeNonNegativeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function normalizeTimestamp(value, fallback = Date.now()) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : fallback;
}
