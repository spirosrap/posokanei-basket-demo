export const APP_ROUTES = {
  home: "home",
  bargains: "bargains",
  changes: "changes",
};

export function appRouteFromPathname(pathname, basePath = "/") {
  const normalizedBase = normalizeBasePath(basePath);
  const normalizedPath = `/${String(pathname || "").replace(/^\/+|\/+$/g, "")}/`;
  if (!normalizedPath.startsWith(normalizedBase)) return APP_ROUTES.home;

  const relativePath = normalizedPath
    .slice(normalizedBase.length)
    .replace(/^\/+|\/+$/g, "");
  if (relativePath === "bargains") return APP_ROUTES.bargains;
  if (relativePath === "changes") return APP_ROUTES.changes;
  return APP_ROUTES.home;
}

export function isUnmodifiedPrimaryClick(event) {
  return event.button === 0
    && !event.defaultPrevented
    && !event.metaKey
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey;
}

function normalizeBasePath(basePath) {
  const value = String(basePath || "/").replace(/^\/+|\/+$/g, "");
  return value ? `/${value}/` : "/";
}
