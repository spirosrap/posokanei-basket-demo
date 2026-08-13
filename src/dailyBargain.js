function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

const MIN_BARGAIN_SAVINGS = 0.35;
const MIN_BARGAIN_PERCENT = 12;
const MAX_BARGAIN_PERCENT = 75;
const TRAILING_BARGAIN_PERCENTAGE = new RegExp(
  String.raw`\s*(?:[:|·–—-]\s*)?\d+(?:[.,]\d+)?\s*%\s*`
  + String.raw`(?:(?:πιο\s+)?(?:χαμηλότερ\p{L}*|φθηνότερ\p{L}*|κάτω|έκπτωση)`
  + String.raw`|(?:cheaper|lower|discount|off))\s*$`,
  "iu",
);

function fallbackBargainHeadline(product) {
  const brand = String(product?.brand || "").trim();
  const category = String(product?.category || product?.subcategory || "").trim();
  if (brand && category) return `${brand} · ${category}`;
  return brand || String(product?.name || "Ευκαιρία τιμής").trim() || "Ευκαιρία τιμής";
}

export function sanitizeBargainHeadline(headline, product = {}) {
  const cleaned = String(headline || "").replace(/\s+/gu, " ").trim();
  const withoutStalePercentage = cleaned
    .replace(TRAILING_BARGAIN_PERCENTAGE, "")
    .replace(/[\s:|·–—-]+$/gu, "")
    .trim();
  return withoutStalePercentage || fallbackBargainHeadline(product);
}

export function isMeaningfulBargainEvidence(evidence) {
  const savings = Number(evidence?.savingsVsHighest);
  const percent = Number(evidence?.savingsPercentVsHighest);
  return Number.isFinite(savings)
    && Number.isFinite(percent)
    && savings >= MIN_BARGAIN_SAVINGS
    && percent >= MIN_BARGAIN_PERCENT
    && percent <= MAX_BARGAIN_PERCENT;
}

export function currentBargainEvidence(product, previousEvidence = {}) {
  const prices = Object.entries(product?.prices || {})
    .map(([retailerId, value]) => ({
      retailerId,
      price: Number(value),
    }))
    .filter((entry) => entry.retailerId && Number.isFinite(entry.price) && entry.price > 0)
    .sort((left, right) => (
      left.price - right.price || left.retailerId.localeCompare(right.retailerId)
    ));
  if (prices.length < 2) return null;

  const best = prices[0];
  const highest = prices.at(-1);
  const median = prices[Math.floor(prices.length / 2)];
  const savings = highest.price - best.price;
  const retailerNames = product?.retailerNames || {};

  return {
    bestPrice: roundMoney(best.price),
    bestRetailerId: best.retailerId,
    bestRetailerName:
      retailerNames[best.retailerId]
      || (
        previousEvidence.bestRetailerId === best.retailerId
          ? previousEvidence.bestRetailerName
          : ""
      )
      || best.retailerId,
    medianPrice: roundMoney(median.price),
    highestPrice: roundMoney(highest.price),
    savingsVsHighest: roundMoney(savings),
    savingsPercentVsHighest: highest.price > 0
      ? Math.round((savings / highest.price) * 1000) / 10
      : 0,
    retailerCount: prices.length,
  };
}

export function refreshDailyBargainProducts(
  pick,
  currentProducts,
  catalogGeneratedAt = "",
) {
  const productsById = new Map(
    (Array.isArray(currentProducts) ? currentProducts : [])
      .map((product) => [String(product?.id || ""), product])
      .filter(([id]) => id),
  );
  const sourceBargains = Array.isArray(pick?.bargains) && pick.bargains.length
    ? pick.bargains
    : [pick];
  const bargains = sourceBargains
    .map((bargain) => {
      const product = productsById.get(String(bargain?.productId || ""));
      if (!product) return null;
      const evidence = currentBargainEvidence(product, bargain.evidence);
      if (!evidence || !isMeaningfulBargainEvidence(evidence)) return null;
      return {
        ...bargain,
        headline: sanitizeBargainHeadline(bargain.headline, product),
        evidence,
        product,
      };
    })
    .filter(Boolean);

  if (!bargains.length) {
    throw new Error("Daily bargain products are unavailable in the current catalogue.");
  }

  return {
    ...pick,
    ...bargains[0],
    date: pick?.date || "",
    generatedAt: pick?.generatedAt || "",
    catalogGeneratedAt: catalogGeneratedAt || pick?.catalogGeneratedAt || "",
    bargains,
  };
}
