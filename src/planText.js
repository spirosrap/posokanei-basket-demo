import { formatEuro } from "./pricing.js";

export function formatPlanText(plan) {
  if (!plan?.isComplete) return "";
  const stopLabel = plan.chainCount === 1 ? "1 στάση" : `${plan.chainCount} στάσεις`;
  const lines = [
    "Καλάθι Τιμών Supermarket",
    `Πλάνο αγορών · ${stopLabel} · Σύνολο ${formatEuro(plan.total)}`,
  ];

  plan.groups.forEach((group, index) => {
    lines.push("", `${index + 1}. ${group.retailer.name} · ${formatEuro(group.total)}`);
    group.items.forEach((item) => {
      lines.push(`- ${item.quantity} x ${item.product.name} · ${formatEuro(item.lineTotal)}`);
    });
  });

  return lines.join("\n");
}
