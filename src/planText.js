import { formatEuro } from "./pricing.js";
import { localeForLanguage, translate } from "./i18n.js";

export function formatPlanText(plan, language = "el") {
  if (!plan?.isComplete) return "";
  const t = (key, values) => translate(language, key, values);
  const locale = localeForLanguage(language);
  const money = (value) => formatEuro(value, locale);
  const stopLabel = plan.chainCount === 1
    ? t("oneStopLabel")
    : t("stopsLabel", { count: plan.chainCount });
  const lines = [
    t("shoppingPlanTitle"),
    t("shoppingPlanSummary", { stops: stopLabel, total: money(plan.total) }),
  ];

  plan.groups.forEach((group, index) => {
    lines.push("", `${index + 1}. ${group.retailer.name} · ${money(group.total)}`);
    group.items.forEach((item) => {
      lines.push(`- ${item.quantity} x ${item.product.name} · ${money(item.lineTotal)}`);
    });
  });

  return lines.join("\n");
}
