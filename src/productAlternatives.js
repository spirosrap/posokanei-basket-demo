const BROAD_CATEGORY_PATTERNS = [
  /μαλακα αλοιφωμενα/u,
  /λευκα τυρια/u,
  /κιτρινα τυρια/u,
  /ψωμι τυποποιημενο/u,
  /σοκολατ/u,
  /πουλερικα αλλαντικα/u,
  /αλλαντικ/u,
  /ετοιμα γευματα/u,
  /λαχανικα γευματα/u,
];

const FAMILY_RULES = [
  { id: "cottage-cheese", category: /τυρ|μαλακα/u, pattern: /\b(cottage|κοτατζ)\b/u },
  { id: "mascarpone", category: /τυρ|μαλακα/u, pattern: /\bmascarpone\b|μασκαρπονε/u },
  { id: "ricotta", category: /τυρ|μαλακα/u, pattern: /\bricotta\b|ρικοτα/u },
  { id: "feta", category: /τυρ/u, pattern: /\bφετα\b/u },
  { id: "mozzarella", category: /τυρ/u, pattern: /mozzarella|μοτσαρελα/u },
  { id: "gouda", category: /τυρ/u, pattern: /\bgouda\b|γκουντα/u },
  { id: "cheddar", category: /τυρ/u, pattern: /\bcheddar\b|τσενταρ/u },
  { id: "edam", category: /τυρ/u, pattern: /\bedam\b|ενταμ/u },
  { id: "kasseri", category: /τυρ/u, pattern: /κασ[εσ]ρι/u },
  { id: "graviera", category: /τυρ/u, pattern: /γραβιερα/u },
  { id: "manouri", category: /τυρ/u, pattern: /μανουρι/u },
  { id: "anthotyro", category: /τυρ/u, pattern: /ανθοτυρ/u },
  { id: "mizithra", category: /τυρ/u, pattern: /μυζηθρ/u },
  { id: "kefalotyri", category: /τυρ/u, pattern: /κεφαλοτυρ/u },
  { id: "parmesan", category: /τυρ/u, pattern: /parmesan|παρμεζ|parmigiano|grana padano/u },
  { id: "halloumi", category: /τυρ/u, pattern: /halloumi|χαλουμι|ταλαγαν/u },
  { id: "blue-cheese", category: /τυρ/u, pattern: /blue cheese|μπλε τυρ|ροκφορ|gorgonzola/u },
  { id: "emmental", category: /τυρ/u, pattern: /emmental|εμενταλ/u },
  {
    id: "cream-cheese",
    category: /τυρ|μαλακα/u,
    pattern: /τυρι κρεμα|cream cheese|\bphiladelphia\b/u,
  },
  { id: "german-bread", category: /ψωμι/u, pattern: /γερμανικ/u },
  { id: "toast-bread", category: /ψωμι/u, pattern: /\bτοστ\b|\btoast\b/u },
  { id: "tortilla-wrap", category: /ψωμι|πιτ/u, pattern: /tortilla|τορτιγ|wrap|αραβικ/u },
  { id: "burger-bun", category: /ψωμι|αρτοποι/u, pattern: /burger|hamburger|μπριο[σς]|μπεργκερ/u },
  { id: "hot-dog-bun", category: /ψωμι|αρτοποι/u, pattern: /hot dog|χοτ ντογκ/u },
  { id: "country-bread", category: /ψωμι/u, pattern: /χωριαν|village/u },
  { id: "multiseed-bread", category: /ψωμι/u, pattern: /πολυσπορ|multiseed/u },
  { id: "wholegrain-bread", category: /ψωμι/u, pattern: /ολικης αλεσης|wholegrain|whole grain/u },
  { id: "rye-bread", category: /ψωμι/u, pattern: /σικαλη|rye/u },
  { id: "dark-chocolate", category: /σοκολατ/u, pattern: /μαυρη|υγειας|dark|\b[5-9][0-9]%/u },
  { id: "white-chocolate", category: /σοκολατ/u, pattern: /λευκη|white/u },
  { id: "milk-chocolate", category: /σοκολατ/u, pattern: /γαλακτος|milk/u },
  { id: "cooking-chocolate", category: /σοκολατ/u, pattern: /κουβερτουρ|μαγειρικ|baking/u },
  { id: "turkey-cold-cuts", category: /αλλαντικ|πουλερικα/u, pattern: /γαλοπουλ/u },
  { id: "ham", category: /αλλαντικ|πουλερικα/u, pattern: /ζαμπον|ham\b/u },
  { id: "salami", category: /αλλαντικ|πουλερικα/u, pattern: /σαλαμι|salami/u },
  { id: "bacon", category: /αλλαντικ|πουλερικα/u, pattern: /μπεικον|bacon/u },
];

const TRAIT_RULES = [
  { id: "protein", pattern: /protein|πρωτειν/u },
  { id: "light", pattern: /\blight\b|ελαφρ/u },
  { id: "organic", pattern: /βιολογικ|\bbio\b|organic/u },
  { id: "glutenFree", pattern: /χωρις γλουτενη|gluten free/u },
  { id: "lactoseFree", pattern: /χωρις λακτοζη|lactose free/u },
  { id: "vegan", pattern: /\bvegan\b|φυτικ/u },
  { id: "sugarFree", pattern: /χωρις ζαχαρη|sugar free|\bzero\b/u },
  { id: "wholegrain", pattern: /ολικης αλεσης|wholegrain|whole grain/u },
  { id: "multiseed", pattern: /πολυσπορ|multiseed/u },
  { id: "rye", pattern: /σικαλη|rye/u },
  { id: "mild", pattern: /απαλη|mild/u },
  { id: "spicy", pattern: /πικαντικ|spicy|dijon|ντιζον/u },
  { id: "smoked", pattern: /καπνιστ|smoked/u },
  { id: "sliced", pattern: /σε φετες|\bφετες\b|sliced|slices/u },
  { id: "grated", pattern: /τριμμεν|grated/u },
];

const FORMAT_RULES = [
  {
    id: "sliced",
    category: /τυρ|γκουντα|αλλαντικ|πουλερικα/u,
    pattern: /σε φετες|\bφετες\b|sliced|slices/u,
  },
  {
    id: "grated",
    category: /τυρ|γκουντα/u,
    pattern: /τριμμεν|grated/u,
  },
  {
    id: "block",
    category: /τυρ|γκουντα/u,
    pattern: /κομματι|μπαστουνι|block/u,
  },
];

const STOP_WORDS = new Set([
  "και", "με", "σε", "για", "απο", "του", "της", "των", "το", "η", "ο", "τα", "οι",
  "τυπου", "προιον", "ψωμι", "τυρι", "φετες", "συσκευασια", "τεμαχια", "τεμαχιο",
  "with", "and", "the", "for", "product", "sliced", "pack", "pcs", "piece",
  "g", "gr", "kg", "ml", "lt", "l", "γρ", "κιλα", "κιλο", "λιτρα", "λιτρο",
]);

function folded(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR")
    .replace(/[^a-z0-9α-ω%]+/gu, " ")
    .trim();
}

function rawId(product) {
  return String(product?.id ?? product?.product_id ?? product?.gtin ?? product?.barcode ?? "");
}

function rawCategoryIds(product) {
  const ids = product?.category_ids ?? product?.categoryIds;
  return Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
}

function categoryKey(product) {
  const ids = rawCategoryIds(product);
  return ids[ids.length - 1] || folded(product?.category || product?.subcategory || "");
}

function categoryText(product) {
  return folded(`${product?.category || ""} ${product?.subcategory || ""}`);
}

function normalizedUnit(product) {
  const unit = folded(product?.unit || "");
  if (["kg", "kgr", "κιλο", "κιλα"].includes(unit)) return "kg";
  if (["l", "lt", "ltr", "λιτρο", "λιτρα"].includes(unit)) return "L";
  if (["pcs", "pc", "τεμ", "τεμαχιο", "τεμαχια"].includes(unit)) return "pcs";
  return unit;
}

function unitAmount(product) {
  const value = Number(product?.unit_quantity ?? product?.unitAmount);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function familyFor(product) {
  const category = categoryText(product);
  const text = folded(`${product?.name || product?.title || ""} ${product?.brand || ""}`);
  return FAMILY_RULES.find((rule) => rule.category.test(category) && rule.pattern.test(text))?.id || "";
}

function traitsFor(product) {
  const text = folded(`${product?.name || product?.title || ""} ${product?.description || ""}`);
  return TRAIT_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.id);
}

function formatFor(product) {
  const category = categoryText(product);
  const text = folded(product?.name || product?.title || "");
  return FORMAT_RULES.find((rule) => rule.category.test(category) && rule.pattern.test(text))?.id || "";
}

function signatureTokens(product) {
  const brandTokens = new Set(folded(product?.brand || "").split(/\s+/u).filter(Boolean));
  const categoryTokens = new Set(categoryText(product).split(/\s+/u).filter(Boolean));
  return [...new Set(
    folded(product?.name || product?.title || "")
      .split(/\s+/u)
      .filter((token) => token.length >= 3)
      .filter((token) => !/^\d+(?:\.\d+)?%?$/u.test(token))
      .filter((token) => !STOP_WORDS.has(token))
      .filter((token) => !brandTokens.has(token))
      .filter((token) => !categoryTokens.has(token)),
  )];
}

function retailerPriceEntries(product) {
  const entries = product?.retailer_prices ?? product?.prices ?? [];
  if (Array.isArray(entries)) return entries;
  return Object.entries(entries).map(([retailer, price]) => ({ retailer, price }));
}

function bestOffer(product, retailerIds) {
  const eligible = retailerIds?.size ? retailerIds : null;
  let best = null;
  for (const entry of retailerPriceEntries(product)) {
    const retailerId = String(entry?.retailer ?? entry?.retailer_id ?? "").toLocaleLowerCase("en-US");
    const price = Number(entry?.price ?? entry?.final_price ?? entry?.value);
    if (!retailerId || !Number.isFinite(price) || price <= 0 || (eligible && !eligible.has(retailerId))) {
      continue;
    }
    const unitPriceValue = Number(entry?.price_normalized ?? entry?.unit_price);
    const amount = unitAmount(product);
    const unitPrice = Number.isFinite(unitPriceValue) && unitPriceValue > 0
      ? unitPriceValue
      : amount
        ? price / amount
        : null;
    if (!best || price < best.price) {
      best = { retailerId, price, unitPrice };
    }
  }
  return best;
}

function sharedCount(left, right) {
  const rightSet = new Set(right);
  return left.reduce((count, value) => count + (rightSet.has(value) ? 1 : 0), 0);
}

function packageRatio(left, right) {
  const leftAmount = unitAmount(left);
  const rightAmount = unitAmount(right);
  if (!leftAmount || !rightAmount) return 1;
  return rightAmount / leftAmount;
}

function comparablePackageSize(left, right) {
  const ratio = packageRatio(left, right);
  return ratio >= 0.4 && ratio <= 2.5;
}

function isBroadCategory(product) {
  const category = folded(product?.category || "");
  return BROAD_CATEGORY_PATTERNS.some((pattern) => pattern.test(category));
}

function productEntry(product) {
  return {
    product,
    id: rawId(product),
    categoryKey: categoryKey(product),
    unit: normalizedUnit(product),
    family: familyFor(product),
    format: formatFor(product),
    traits: traitsFor(product),
    tokens: signatureTokens(product),
  };
}

function dedupeKey(entry) {
  const amount = unitAmount(entry.product);
  return [
    folded(entry.product?.brand || ""),
    entry.family,
    [...entry.tokens].sort().join("-"),
    entry.unit,
    amount == null ? "" : amount.toFixed(4),
  ].join("|");
}

export function prepareProductAlternatives(rawProducts = []) {
  const entries = rawProducts.map(productEntry).filter((entry) => entry.id && entry.categoryKey);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const byCategory = new Map();
  entries.forEach((entry) => {
    const list = byCategory.get(entry.categoryKey) || [];
    list.push(entry);
    byCategory.set(entry.categoryKey, list);
  });
  return { entries, byId, byCategory };
}

function scoreCandidate(source, candidate, sourceOffer, candidateOffer) {
  const tokenMatches = sharedCount(source.tokens, candidate.tokens);
  const traitMatches = sharedCount(source.traits, candidate.traits);
  const ratio = packageRatio(source.product, candidate.product);
  const sizeScore = Math.max(0, 16 - Math.abs(Math.log2(ratio)) * 12);
  const familyScore = source.family && source.family === candidate.family ? 42 : 0;
  const formatScore = source.format && source.format === candidate.format ? 8 : 0;
  const tokenScore = Math.min(24, tokenMatches * 8);
  const traitScore = Math.min(12, traitMatches * 4);
  const unitSavingPercent = sourceOffer?.unitPrice && candidateOffer?.unitPrice
    ? ((sourceOffer.unitPrice - candidateOffer.unitPrice) / sourceOffer.unitPrice) * 100
    : 0;
  const valueScore = Math.max(0, Math.min(8, unitSavingPercent / 4));
  return 60 + familyScore + formatScore + tokenScore + traitScore + sizeScore + valueScore;
}

function suggestionMetadata(source, candidate, sourceOffer, candidateOffer, score) {
  const baseline = sourceOffer?.unitPrice && candidateOffer?.unitPrice
    ? { source: sourceOffer.unitPrice, candidate: candidateOffer.unitPrice, basis: "unit" }
    : { source: sourceOffer?.price, candidate: candidateOffer.price, basis: "package" };
  const savingsAmount = Number.isFinite(baseline.source)
    ? baseline.source - baseline.candidate
    : 0;
  const savingsPercent = baseline.source > 0 ? (savingsAmount / baseline.source) * 100 : 0;
  const sharedTraits = candidate.traits.filter((trait) => source.traits.includes(trait));
  const distinctiveTraits = candidate.traits.filter((trait) => !source.traits.includes(trait));
  return {
    product: candidate.product,
    matchKind: source.family && source.family === candidate.family ? "specific" : "category",
    similarityScore: Math.round(score),
    bestRetailerId: candidateOffer.retailerId,
    bestPrice: candidateOffer.price,
    bestUnitPrice: candidateOffer.unitPrice,
    savingsBasis: baseline.basis,
    savingsAmount,
    savingsPercent,
    traits: [...sharedTraits, ...distinctiveTraits].slice(0, 3),
    sizeRatio: packageRatio(source.product, candidate.product),
  };
}

export function findProductAlternatives(
  prepared,
  { productId, retailerIds = [], limit = 6 } = {},
) {
  const source = prepared?.byId?.get(String(productId));
  if (!source) return { productId: String(productId || ""), suggestions: [] };
  const eligibleRetailers = new Set(
    retailerIds.map((id) => String(id).toLocaleLowerCase("en-US")).filter(Boolean),
  );
  const sourceOffer = bestOffer(source.product, eligibleRetailers);
  const broadCategory = isBroadCategory(source.product);
  const candidates = [];

  for (const candidate of prepared.byCategory.get(source.categoryKey) || []) {
    if (candidate.id === source.id) continue;
    if (source.unit && candidate.unit && source.unit !== candidate.unit) continue;
    if (!comparablePackageSize(source.product, candidate.product)) continue;
    if (source.format && candidate.format !== source.format) continue;

    const tokenMatches = sharedCount(source.tokens, candidate.tokens);
    if (broadCategory) {
      if (source.family && candidate.family !== source.family) continue;
      if (!source.family && tokenMatches === 0) continue;
    }

    const offer = bestOffer(candidate.product, eligibleRetailers);
    if (!offer) continue;
    const score = scoreCandidate(source, candidate, sourceOffer, offer);
    candidates.push({ candidate, offer, score });
  }

  const deduped = new Map();
  candidates.forEach((item) => {
    const key = dedupeKey(item.candidate);
    const current = deduped.get(key);
    if (
      !current
      || item.score > current.score
      || (item.score === current.score && (item.offer.unitPrice ?? item.offer.price) < (current.offer.unitPrice ?? current.offer.price))
    ) {
      deduped.set(key, item);
    }
  });

  const suggestions = [...deduped.values()]
    .sort((left, right) =>
      right.score - left.score
      || (left.offer.unitPrice ?? left.offer.price) - (right.offer.unitPrice ?? right.offer.price)
      || String(left.candidate.product?.name || "").localeCompare(
        String(right.candidate.product?.name || ""),
        "el",
      ))
    .slice(0, Math.max(1, Math.min(8, Number(limit) || 6)))
    .map(({ candidate, offer, score }) =>
      suggestionMetadata(source, candidate, sourceOffer, offer, score));

  return { productId: source.id, suggestions };
}
