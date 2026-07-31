export const RECENT_SEARCHES_KEY = "posokanei-recent-searches";
export const RECENT_SEARCHES_LIMIT = 6;

export function normalizeRecentSearch(value) {
  return String(value || "").replace(/\s+/gu, " ").trim();
}

function recentSearchKey(value) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("el-GR");
}

export function addRecentSearch(searches, value, limit = RECENT_SEARCHES_LIMIT) {
  const query = normalizeRecentSearch(value);
  const current = sanitizeRecentSearches(searches, limit);
  if (query.length < 2) return current;

  const normalizedQuery = recentSearchKey(query);
  return [
    query,
    ...current.filter(
      (entry) => recentSearchKey(entry) !== normalizedQuery,
    ),
  ].slice(0, Math.max(1, Number(limit) || RECENT_SEARCHES_LIMIT));
}

export function loadRecentSearches(storage = globalThis.localStorage) {
  try {
    return sanitizeRecentSearches(
      JSON.parse(storage?.getItem(RECENT_SEARCHES_KEY) || "[]"),
    );
  } catch {
    return [];
  }
}

export function persistRecentSearches(searches, storage = globalThis.localStorage) {
  const normalized = sanitizeRecentSearches(searches);
  try {
    storage?.setItem(RECENT_SEARCHES_KEY, JSON.stringify(normalized));
  } catch {
    // Keep shortcuts available for the current session when storage is restricted.
  }
  return normalized;
}

function sanitizeRecentSearches(searches, limit = RECENT_SEARCHES_LIMIT) {
  if (!Array.isArray(searches)) return [];
  const unique = new Set();
  const normalized = [];
  for (const value of searches) {
    const query = normalizeRecentSearch(value);
    const key = recentSearchKey(query);
    if (query.length < 2 || unique.has(key)) continue;
    unique.add(key);
    normalized.push(query);
    if (normalized.length >= Math.max(1, Number(limit) || RECENT_SEARCHES_LIMIT)) break;
  }
  return normalized;
}
