const DEFAULT_LIVE_APP_URL = "https://kalathitimon.com/";

const env = import.meta.env || {};

export const APP_BASE_URL = normalizeBaseUrl(env.BASE_URL || "/");
export const LIVE_APP_URL = normalizeLiveUrl(
  env.VITE_LIVE_APP_URL || DEFAULT_LIVE_APP_URL,
);

export function runtimeAppUrl(path) {
  const relativePath = String(path || "").replace(/^\/+/, "");
  if (env.DEV) return new URL(relativePath, LIVE_APP_URL).toString();
  return `${APP_BASE_URL}${relativePath}`;
}

function normalizeBaseUrl(value) {
  const base = String(value || "/");
  return `/${base.replace(/^\/+|\/+$/g, "")}${base === "/" ? "" : "/"}`;
}

function normalizeLiveUrl(value) {
  const url = new URL(String(value || DEFAULT_LIVE_APP_URL));
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.toString();
}
