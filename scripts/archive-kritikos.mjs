// Build a read-only export from saved PosoKanei snapshots, never from basket estimates.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const [out, ...inputs] = process.argv.slice(2);
if (!out || !inputs.length) throw new Error("Usage: node archive-kritikos.mjs NEW_OUTPUT SNAPSHOT...");
const source = "https://api.posokanei.gov.gr";
const snapshots = [];
for (const path of inputs) {
  const data = JSON.parse(await readFile(path, "utf8"));
  const observedAt = data.generated_at || data.fetched_at;
  if (data.source !== source || !Number.isFinite(Date.parse(observedAt))) throw new Error("Unknown snapshot source or date");
  const prices = data.products.flatMap(p => (p.retailer_prices || [])
    .filter(o => o.retailer === "kritikos" && (o.country || "GR") === "GR" && o.price > 0)
    .map(o => ({ product_id: p.id, product_name: p.name, ...o })));
  if (prices.length) snapshots.push({ observed_at: observedAt, prices });
}
if (!snapshots.length) throw new Error("No historical Kritikos offers in these snapshots");
snapshots.sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify({ retailer: "kritikos", historical_only: true, currency: "EUR", source, snapshots }), { flag: "wx" });
