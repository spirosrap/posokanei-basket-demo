import { localeForLanguage, translate } from "./i18n.js";
import { formatEuro } from "./pricing.js";

function stopLimitLabel(limit, t) {
  return limit === 1 ? t("upToOneStop") : t("upToStops", { count: limit });
}

function heading(value, locale) {
  return value.toLocaleUpperCase(locale);
}

export function formatBasketText({
  basket,
  productMap,
  selectedStopLimit,
  selectedPlanComplete,
  plan,
  planStopLimit,
  shareUrl,
  language = "el",
}) {
  const t = (key, values) => translate(language, key, values);
  const locale = localeForLanguage(language);
  const money = (value) => formatEuro(value, locale);
  const selectedStops = stopLimitLabel(selectedStopLimit, t);
  const items = basket.flatMap((entry) => {
    const product = productMap.get(entry.productId);
    return product ? [{ ...entry, product }] : [];
  });
  const lines = [
    t("shoppingPlanTitle"),
    "================================",
    t("textExportBasketSummary", { count: items.length, stops: selectedStops }),
    "",
    heading(t("textExportProductsHeading"), locale),
  ];

  items.forEach((item) => {
    lines.push(`[ ] ${item.quantity} x ${item.product.name}`);
  });

  lines.push("", heading(t("textExportPlanHeading"), locale));

  if (plan?.isComplete) {
    const planStops = stopLimitLabel(planStopLimit, t);
    if (!selectedPlanComplete) {
      lines.push(
        t("textExportFallbackPlan", {
          selected: selectedStops,
          available: planStops,
        }),
        "",
      );
    }

    const actualStops =
      plan.chainCount === 1
        ? t("oneStopLabel")
        : t("stopsLabel", { count: plan.chainCount });
    lines.push(t("shoppingPlanSummary", { stops: actualStops, total: money(plan.total) }));
    plan.groups.forEach((group, index) => {
      lines.push("", `${index + 1}. ${group.retailer.name} · ${money(group.total)}`);
      group.items.forEach((item) => {
        lines.push(`[ ] ${item.quantity} x ${item.product.name} · ${money(item.lineTotal)}`);
      });
    });
  } else {
    lines.push(t("textExportNoCompletePlan", { stops: selectedStops }));
  }

  if (shareUrl) {
    lines.push("", heading(t("textExportLinkHeading"), locale), shareUrl);
  }

  lines.push("", t("textExportPriceNote"));
  return lines.join("\n");
}

export function formatPortableTextFile(value) {
  return `\uFEFF${String(value).replace(/\r?\n/g, "\r\n")}`;
}
