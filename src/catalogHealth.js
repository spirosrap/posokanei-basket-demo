function normalizeCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function normalizeEntry(entry = {}) {
  return {
    id: String(entry.id || "").trim(),
    name: String(entry.name || "").trim(),
    productCount: normalizeCount(entry.product_count ?? entry.productCount),
  };
}

function normalizeProfile(profile = {}) {
  return {
    generatedAt: String(profile.generated_at || profile.generatedAt || ""),
    productCount: normalizeCount(profile.product_count ?? profile.productCount),
    categoryCount: normalizeCount(profile.category_count ?? profile.categoryCount),
    totalOffers: normalizeCount(profile.total_offers ?? profile.totalOffers),
    rootCategories: (profile.root_categories || profile.rootCategories || [])
      .map(normalizeEntry)
      .filter((entry) => entry.id && entry.productCount),
    retailers: (profile.retailers || [])
      .map(normalizeEntry)
      .filter((entry) => entry.id && entry.productCount),
  };
}

export function normalizeCatalogHealth(raw = {}) {
  const current = normalizeProfile(raw.current);
  if (!current.generatedAt || !current.productCount) {
    throw new Error("Catalogue health data is incomplete.");
  }
  const previous = raw.previous ? normalizeProfile(raw.previous) : null;
  return {
    schemaVersion: normalizeCount(raw.schema_version ?? raw.schemaVersion) || 1,
    generatedAt: String(raw.generated_at || raw.generatedAt || current.generatedAt),
    source: String(raw.source || ""),
    current,
    previous: previous?.productCount ? previous : null,
  };
}

export function coverageDelta(currentCount, previousCount) {
  const current = normalizeCount(currentCount);
  const previous = normalizeCount(previousCount);
  const value = current - previous;
  return { value, ratio: previous ? value / previous : 0 };
}

export function coverageRows(currentEntries = [], previousEntries = []) {
  const currentById = new Map(currentEntries.map((entry) => [entry.id, entry]));
  const previousById = new Map(previousEntries.map((entry) => [entry.id, entry]));
  const disappearedEntries = previousEntries
    .filter((entry) => !currentById.has(entry.id))
    .map((entry) => ({ ...entry, productCount: 0 }));

  return [...currentEntries, ...disappearedEntries].map((entry) => ({
    ...entry,
    delta: coverageDelta(entry.productCount, previousById.get(entry.id)?.productCount),
  }));
}
