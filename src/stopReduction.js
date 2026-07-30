export function buildStopReductionInsight(comparison) {
  const options = Array.isArray(comparison?.options) ? comparison.options : [];
  const firstCompleteIndex = options.findIndex((option) => option?.isComplete);
  if (firstCompleteIndex <= 0) return null;

  const completeOption = options[firstCompleteIndex];
  const targetOption = options[firstCompleteIndex - 1];
  const missingItems = (targetOption?.plan?.missingItems || []).filter(
    (item) => item?.product?.id,
  );
  if (!missingItems.length) return null;

  const targetRetailers = (targetOption.plan.retailers || []).filter(
    (retailer) => retailer?.id,
  );
  const targetRetailerIds = [...new Set(targetRetailers.map((retailer) => retailer.id))];
  if (!targetRetailerIds.length) return null;

  return {
    requiredStops: completeOption.actualStops || completeOption.limit,
    targetLimit: targetOption.limit,
    coveredCount: targetOption.plan.availableCount || 0,
    totalCount: (targetOption.plan.availableCount || 0) + missingItems.length,
    missingItems,
    targetRetailers,
    targetRetailerIds,
  };
}
