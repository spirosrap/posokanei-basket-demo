#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadLocalEnv(resolve(projectRoot, ".env.local"));

const catalogPath = resolve(
  projectRoot,
  process.env.POSOKANEI_BARGAIN_CATALOG || "dist/data/catalog.json",
);
const outputPath = resolve(
  projectRoot,
  process.env.POSOKANEI_BARGAIN_OUT || "dist/data/daily-bargain.json",
);
const model = process.env.OPENAI_BARGAIN_MODEL || "gpt-5.6-sol";
const reasoningEffort = process.env.OPENAI_BARGAIN_REASONING || "high";
const timeZone = process.env.POSOKANEI_BARGAIN_TIME_ZONE || "Europe/Athens";
const force = process.argv.includes("--force");
const apiKey = requiredEnv("OPENAI_API_KEY");

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const existingPick = await readJsonIfPresent(outputPath);
const today = dateKey(new Date(), timeZone);

if (!force && existingPick?.date === today) {
  console.log(`Daily bargain already generated for ${today}: ${existingPick.product_id}`);
  process.exit(0);
}

const candidates = buildCandidates(catalog.products || []);
if (candidates.length < 5) {
  throw new Error(`Daily bargain guard failed: only ${candidates.length} suitable candidates.`);
}

const choice = await chooseWithOpenAI(candidates, existingPick?.product_id || "");
const selected = candidates.find((candidate) => candidate.product_id === choice.product_id);
if (!selected) {
  throw new Error("The model selected a product outside the verified candidate list.");
}

const sourceProduct = (catalog.products || []).find(
  (product) => String(product.id) === selected.product_id,
);
if (!sourceProduct) {
  throw new Error("The selected product no longer exists in the catalogue.");
}

const output = {
  schema_version: 1,
  date: today,
  generated_at: new Date().toISOString(),
  catalog_generated_at: catalog.generated_at || "",
  model,
  reasoning_effort: reasoningEffort,
  product_id: selected.product_id,
  headline: cleanText(choice.headline, 80),
  reason: cleanText(choice.reason, 240),
  evidence: {
    best_price: selected.best_price,
    best_retailer_id: selected.best_retailer_id,
    best_retailer_name: selected.best_retailer_name,
    median_price: selected.median_price,
    highest_price: selected.highest_price,
    savings_vs_highest: selected.savings_vs_highest,
    savings_percent_vs_highest: selected.savings_percent_vs_highest,
    retailer_count: selected.retailer_count,
  },
  product: sourceProduct,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(
  `Generated daily bargain for ${today}: ${sourceProduct.name.trim()} at ${selected.best_retailer_name} (${selected.best_price.toFixed(2)} EUR).`,
);

function buildCandidates(products) {
  const ranked = products
    .map(toCandidate)
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  const perCategory = new Map();
  const diverse = [];
  for (const candidate of ranked) {
    const category = candidate.category || "Άλλα";
    const count = perCategory.get(category) || 0;
    if (count >= 2) continue;
    perCategory.set(category, count + 1);
    diverse.push(candidate);
    if (diverse.length >= 30) break;
  }
  return diverse;
}

function toCandidate(product) {
  const prices = (product.retailer_prices || [])
    .map((entry) => ({
      retailer_id: String(entry.retailer || entry.retailer_id || ""),
      retailer_name: String(entry.retailer_display_name || entry.retailer_name || entry.retailer || ""),
      price: Number(entry.price),
      is_discount: Boolean(entry.is_discount),
    }))
    .filter((entry) => entry.retailer_id && Number.isFinite(entry.price) && entry.price > 0)
    .sort((a, b) => a.price - b.price);

  if (
    !product?.id ||
    !product?.name ||
    !product?.image_url ||
    prices.length < 5 ||
    prices[0].price < 0.35 ||
    prices[0].price > 80
  ) {
    return null;
  }

  const best = prices[0];
  const highest = prices.at(-1).price;
  const median = prices[Math.floor(prices.length / 2)].price;
  const savings = highest - best.price;
  const savingsPercent = highest > 0 ? (savings / highest) * 100 : 0;
  if (savings < 0.35 || savingsPercent < 12 || savingsPercent > 75) return null;

  const score =
    savingsPercent +
    Math.min(savings, 8) * 2 +
    Math.min(prices.length, 10) +
    (prices.some((entry) => entry.is_discount) ? 3 : 0);

  return {
    product_id: String(product.id),
    name: String(product.name).trim(),
    brand: String(product.brand || ""),
    category: String(product.category || product.subcategory || ""),
    unit: String(product.unit || ""),
    unit_quantity: product.unit_quantity ?? "",
    best_price: roundMoney(best.price),
    best_retailer_id: best.retailer_id,
    best_retailer_name: best.retailer_name,
    median_price: roundMoney(median),
    highest_price: roundMoney(highest),
    savings_vs_highest: roundMoney(savings),
    savings_percent_vs_highest: Math.round(savingsPercent),
    retailer_count: prices.length,
    score,
  };
}

async function chooseWithOpenAI(candidates, previousProductId) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: reasoningEffort },
      service_tier: "default",
      store: false,
      max_output_tokens: 700,
      instructions: [
        "Είσαι ο συντάκτης της καθημερινής πρότασης σε ελληνική εφαρμογή σύγκρισης supermarket.",
        "Διάλεξε ακριβώς ένα προϊόν μόνο από τη λίστα υποψηφίων.",
        "Προτίμησε χρήσιμο, ευρείας κατανάλωσης προϊόν με ουσιαστική διαφορά τιμής και αρκετές διαθέσιμες αλυσίδες.",
        "Μην εφευρίσκεις έκπτωση, ποιότητα, γεύση, διαθεσιμότητα, ιστορικό τιμής ή όφελος υγείας.",
        "Η αιτιολόγηση πρέπει να είναι μία φυσική ελληνική πρόταση και να βασίζεται μόνο στα αριθμητικά στοιχεία της λίστας.",
        "Μην επαναλαμβάνεις την τιμή στο headline. Μην χρησιμοποιείς markdown.",
      ].join(" "),
      input: JSON.stringify({
        previous_product_id: previousProductId || null,
        instruction:
          "Απόφυγε το προηγούμενο προϊόν όταν υπάρχει εξίσου καλή εναλλακτική. Το headline να είναι έως 55 χαρακτήρες και το reason έως 170 χαρακτήρες.",
        candidates: candidates.map(({ score, ...candidate }) => candidate),
      }),
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "daily_supermarket_bargain",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              product_id: { type: "string" },
              headline: { type: "string" },
              reason: { type: "string" },
            },
            required: ["product_id", "headline", "reason"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI Responses API returned HTTP ${response.status}: ${safeApiError(detail)}`);
  }

  const payload = await response.json();
  const outputText =
    payload.output_text ||
    payload.output
      ?.flatMap((item) => item.content || [])
      .find((item) => item.type === "output_text")?.text;
  if (!outputText) {
    throw new Error(`OpenAI response did not contain output text (status: ${payload.status || "unknown"}).`);
  }
  return JSON.parse(outputText);
}

function safeApiError(value) {
  try {
    const parsed = JSON.parse(value);
    return String(parsed?.error?.message || "API request failed.").slice(0, 300);
  } catch {
    return "API request failed.";
  }
}

function cleanText(value, maxLength) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  if (!cleaned) throw new Error("The model returned an empty daily bargain text.");
  return cleaned.slice(0, maxLength);
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dateKey(date, zone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function readJsonIfPresent(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function loadLocalEnv(envPath) {
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "").replace(/\\n/g, "\n");
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set in the local environment.`);
  return value;
}
