const CENT = 0.01;
const MAX_HISTORY_POINTS = 200;

export const PRICE_CHANGE_RETENTION_DAYS = 7;
export const MIN_NOTABLE_CHANGE_EUROS = 0.1;
export const MIN_NOTABLE_CHANGE_PERCENT = 3;
export const LARGE_NOTABLE_CHANGE_EUROS = 0.5;

function finitePrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function retailerId(entry) {
  return String(entry?.retailer || entry?.retailer_id || "").trim().toLowerCase();
}

function isGreekOffer(entry) {
  return String(entry?.country || "GR").toUpperCase() === "GR";
}

export function isNotablePriceChange(previousPrice, currentPrice) {
  const previous = finitePrice(previousPrice);
  const current = finitePrice(currentPrice);
  if (previous === null || current === null) return false;
  const amount = Math.abs(round(current - previous));
  const percentage = Math.abs(((current - previous) / previous) * 100);
  return amount >= MIN_NOTABLE_CHANGE_EUROS
    && (percentage >= MIN_NOTABLE_CHANGE_PERCENT || amount >= LARGE_NOTABLE_CHANGE_EUROS);
}

function normalizedRetainedChange(change, currentPrice, generatedAtMs, retentionMs) {
  if (!change || typeof change !== "object") return null;
  const previousPrice = finitePrice(change.previous_price ?? change.previousPrice);
  const amount = Number(change.amount);
  const percentage = Number(change.percentage);
  const changedAt = String(change.changed_at ?? change.changedAt ?? "");
  const comparedAt = String(change.compared_at ?? change.comparedAt ?? "");
  const changedAtMs = Date.parse(changedAt);
  if (
    previousPrice === null
    || !Number.isFinite(amount)
    || !Number.isFinite(percentage)
    || !Number.isFinite(changedAtMs)
    || changedAtMs > generatedAtMs + 5 * 60 * 1000
    || generatedAtMs - changedAtMs > retentionMs
    || Math.abs(round(previousPrice + amount) - currentPrice) >= CENT
  ) {
    return null;
  }
  return {
    previous_price: round(previousPrice),
    amount: round(amount),
    percentage: round(percentage, 1),
    changed_at: changedAt,
    ...(comparedAt ? { compared_at: comparedAt } : {}),
  };
}

function createPriceChange(previousPrice, currentPrice, generatedAt, comparedAt) {
  const amount = round(currentPrice - previousPrice);
  return {
    previous_price: round(previousPrice),
    amount,
    percentage: round((amount / previousPrice) * 100, 1),
    changed_at: generatedAt,
    ...(comparedAt ? { compared_at: comparedAt } : {}),
  };
}

function normalizedHistoryPoints(history, generatedAtMs, retentionMs) {
  if (!Array.isArray(history)) return [];
  const cutoffMs = generatedAtMs - retentionMs;
  const pointsByTime = new Map();

  for (const point of history.slice(-MAX_HISTORY_POINTS * 2)) {
    const price = finitePrice(point?.price);
    const observedAt = String(point?.observed_at ?? point?.observedAt ?? "");
    const observedAtMs = Date.parse(observedAt);
    if (
      price === null
      || !Number.isFinite(observedAtMs)
      || observedAtMs > generatedAtMs + 5 * 60 * 1000
    ) {
      continue;
    }
    pointsByTime.set(observedAt, {
      price: round(price),
      observed_at: observedAt,
      observedAtMs,
    });
  }

  const sorted = [...pointsByTime.values()]
    .sort((left, right) => left.observedAtMs - right.observedAtMs);
  const anchor = [...sorted].reverse().find((point) => point.observedAtMs < cutoffMs);
  const retained = sorted.filter((point) => point.observedAtMs >= cutoffMs);
  return [
    ...(anchor ? [anchor] : []),
    ...retained,
  ]
    .slice(-MAX_HISTORY_POINTS)
    .map(({ price, observed_at }) => ({ price, observed_at }));
}

function appendHistoryPoint(history, price, observedAt) {
  const nextPrice = finitePrice(price);
  const observedAtMs = Date.parse(observedAt);
  if (nextPrice === null || !Number.isFinite(observedAtMs)) return history;
  const next = { price: round(nextPrice), observed_at: observedAt };
  const last = history.at(-1);

  if (last?.observed_at === observedAt) {
    return [...history.slice(0, -1), next];
  }
  if (last && Math.abs(last.price - next.price) < CENT) return history;
  return [...history, next].slice(-MAX_HISTORY_POINTS);
}

function legacyHistoryPoints(previousOffer, previousSnapshotAt) {
  const change = previousOffer?.price_change;
  const previousPrice = finitePrice(change?.previous_price);
  const currentPrice = finitePrice(previousOffer?.price);
  let points = [];

  if (previousPrice !== null) {
    const baselineAt = String(change?.compared_at || previousSnapshotAt || "");
    points = appendHistoryPoint(points, previousPrice, baselineAt);
  }
  if (currentPrice !== null) {
    const changedAt = String(change?.changed_at || previousSnapshotAt || "");
    points = appendHistoryPoint(points, currentPrice, changedAt);
  }
  return points;
}

function buildPriceHistory(
  previousOffer,
  currentPrice,
  generatedAt,
  generatedAtMs,
  retentionMs,
  previousSnapshotAt,
) {
  let history = normalizedHistoryPoints(
    previousOffer?.price_history,
    generatedAtMs,
    retentionMs,
  );
  if (!history.length) {
    history = legacyHistoryPoints(previousOffer, previousSnapshotAt);
  }

  const previousPrice = finitePrice(previousOffer?.price);
  if (!history.length && previousPrice !== null) {
    history = appendHistoryPoint(history, previousPrice, previousSnapshotAt);
  } else if (previousPrice !== null && history.length) {
    history = appendHistoryPoint(history, previousPrice, previousSnapshotAt);
  }
  history = appendHistoryPoint(history, currentPrice, generatedAt);
  return normalizedHistoryPoints(history, generatedAtMs, retentionMs);
}

function offersByRetailer(product) {
  return new Map(
    (Array.isArray(product?.retailer_prices) ? product.retailer_prices : [])
      .filter(isGreekOffer)
      .map((entry) => [retailerId(entry), entry])
      .filter(([id]) => id),
  );
}

export function annotatePriceChanges(
  currentSnapshot,
  previousSnapshot,
  { retentionDays = PRICE_CHANGE_RETENTION_DAYS } = {},
) {
  const generatedAt = String(currentSnapshot?.generated_at || new Date().toISOString());
  const generatedAtMs = Date.parse(generatedAt);
  const effectiveGeneratedAtMs = Number.isFinite(generatedAtMs) ? generatedAtMs : Date.now();
  const retentionMs = Math.max(1, Number(retentionDays) || PRICE_CHANGE_RETENTION_DAYS)
    * 24 * 60 * 60 * 1000;
  const comparedAt = String(previousSnapshot?.generated_at || "");
  const previousProducts = new Map(
    (Array.isArray(previousSnapshot?.products) ? previousSnapshot.products : [])
      .map((product) => [String(product?.id || ""), product])
      .filter(([id]) => id),
  );
  const changedProducts = new Set();
  let activeOffers = 0;
  let newChanges = 0;
  let decreases = 0;
  let increases = 0;

  const products = (Array.isArray(currentSnapshot?.products) ? currentSnapshot.products : [])
    .map((product) => {
      const previousProduct = previousProducts.get(String(product?.id || ""));
      const previousOffers = offersByRetailer(previousProduct);
      const offerContexts = (Array.isArray(product?.retailer_prices) ? product.retailer_prices : [])
        .map((offer) => {
          if (!offer || typeof offer !== "object") return offer;
          const {
            price_change: _ignoredPriceChange,
            price_history: _ignoredPriceHistory,
            ...cleanOffer
          } = offer;
          if (!isGreekOffer(offer)) return { offer: cleanOffer };
          const id = retailerId(offer);
          const currentPrice = finitePrice(offer?.price);
          const previousOffer = previousOffers.get(id);
          const previousPrice = finitePrice(previousOffer?.price);
          if (!id || currentPrice === null || previousPrice === null) {
            return { offer: cleanOffer, id, currentPrice, previousOffer };
          }

          let priceChange = null;
          if (Math.abs(currentPrice - previousPrice) >= CENT) {
            if (isNotablePriceChange(previousPrice, currentPrice)) {
              priceChange = createPriceChange(previousPrice, currentPrice, generatedAt, comparedAt);
              newChanges += 1;
              if (priceChange.amount < 0) decreases += 1;
              if (priceChange.amount > 0) increases += 1;
            }
          } else {
            priceChange = normalizedRetainedChange(
              previousOffer.price_change,
              currentPrice,
              effectiveGeneratedAtMs,
              retentionMs,
            );
          }

          if (priceChange) {
            activeOffers += 1;
            changedProducts.add(String(product.id));
          }
          return {
            offer: priceChange ? { ...cleanOffer, price_change: priceChange } : cleanOffer,
            id,
            currentPrice,
            previousOffer,
          };
        });
      const hasActiveChange = offerContexts.some((context) => context?.offer?.price_change);
      const offers = offerContexts.map((context) => {
        if (!context?.offer || !hasActiveChange || context.currentPrice === null) {
          return context?.offer ?? context;
        }
        const history = buildPriceHistory(
          context.previousOffer,
          context.currentPrice,
          generatedAt,
          effectiveGeneratedAtMs,
          retentionMs,
          comparedAt,
        );
        return history.length
          ? { ...context.offer, price_history: history }
          : context.offer;
      });
      return { ...product, retailer_prices: offers };
    });

  const priceChangeStats = {
    compared_at: comparedAt,
    retention_days: retentionDays,
    products_with_recent_changes: changedProducts.size,
    active_offers: activeOffers,
    new_changes: newChanges,
    decreases,
    increases,
  };

  return {
    snapshot: {
      ...currentSnapshot,
      generated_at: generatedAt,
      price_change_stats: priceChangeStats,
      products,
    },
    stats: priceChangeStats,
  };
}
