const LIVE_APP_URL = "https://agenticspiros.com/demo/posokanei-basket/";
const APP_BASE_URL = import.meta.env?.BASE_URL || "/demo/posokanei-basket/";
const SHORTENER_ENDPOINT = import.meta.env?.DEV
  ? `${LIVE_APP_URL}api/shorten.php`
  : `${APP_BASE_URL}api/shorten.php`;
const CACHE_KEY = "posokanei-short-links-v2";
const MAX_CACHE_ENTRIES = 20;
const MAX_SHARE_TOKEN_LENGTH = 8192;
const inflightRequests = new Map();

function storage() {
  try {
    return globalThis.window?.localStorage ?? null;
  } catch {
    return null;
  }
}

function readCache() {
  try {
    const parsed = JSON.parse(storage()?.getItem(CACHE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cachedShortUrl(longUrl) {
  const entry = readCache().find((item) => item?.longUrl === longUrl);
  return entry ? normalizeShortUrl(entry.shortUrl) : "";
}

function saveCachedShortUrl(longUrl, shortUrl) {
  const target = storage();
  if (!target) return;
  const next = [
    { longUrl, shortUrl },
    ...readCache().filter((item) => item?.longUrl !== longUrl),
  ].slice(0, MAX_CACHE_ENTRIES);
  try {
    target.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    // A short link remains usable even when browser storage is unavailable.
  }
}

function normalizeShortUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (
      url.protocol !== "https:"
      || url.hostname !== "agenticspiros.com"
      || url.search
      || url.hash
      || !/^\/demo\/posokanei-basket\/s\/[a-zA-Z0-9_-]{10,32}$/u.test(url.pathname)
    ) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

export function canonicalizeBasketUrl(value) {
  const source = new URL(String(value || ""), LIVE_APP_URL);
  const token = source.searchParams.get("basket") || "";
  if (
    !token
    || token.length > MAX_SHARE_TOKEN_LENGTH
    || !/^[a-zA-Z0-9_-]+$/u.test(token)
  ) {
    throw new Error("invalid_basket_url");
  }
  const canonical = new URL(LIVE_APP_URL);
  canonical.searchParams.set("basket", token);
  return canonical.toString();
}

export async function shortenBasketUrl(value, { fetchImpl = globalThis.fetch } = {}) {
  const longUrl = canonicalizeBasketUrl(value);
  const cached = cachedShortUrl(longUrl);
  if (cached) return cached;
  if (inflightRequests.has(longUrl)) return inflightRequests.get(longUrl);
  if (typeof fetchImpl !== "function") throw new Error("shortener_unavailable");

  const request = (async () => {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetchImpl(SHORTENER_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: longUrl }),
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`shortener_http_${response.status}`);
      const payload = await response.json();
      const shortUrl = normalizeShortUrl(payload?.short_url);
      if (!shortUrl) throw new Error("invalid_short_url");
      saveCachedShortUrl(longUrl, shortUrl);
      return shortUrl;
    } finally {
      globalThis.clearTimeout(timeout);
    }
  })().finally(() => inflightRequests.delete(longUrl));

  inflightRequests.set(longUrl, request);
  return request;
}
