function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
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
      if (!evidence) return null;
      return {
        ...bargain,
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
