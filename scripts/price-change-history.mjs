const CENT = 0.01;

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
      const offers = (Array.isArray(product?.retailer_prices) ? product.retailer_prices : [])
        .map((offer) => {
          if (!offer || typeof offer !== "object") return offer;
          const { price_change: _ignoredPriceChange, ...cleanOffer } = offer;
          if (!isGreekOffer(offer)) return cleanOffer;
          const id = retailerId(offer);
          const currentPrice = finitePrice(offer?.price);
          const previousOffer = previousOffers.get(id);
          const previousPrice = finitePrice(previousOffer?.price);
          if (!id || currentPrice === null || previousPrice === null) return cleanOffer;

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

          if (!priceChange) return cleanOffer;
          activeOffers += 1;
          changedProducts.add(String(product.id));
          return { ...cleanOffer, price_change: priceChange };
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
