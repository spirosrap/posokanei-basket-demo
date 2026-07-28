export function buildCatalogImageSources(
  imageUrl,
  {
    kind = "product",
    size = 96,
    fallbackSizes = [],
    prioritizeResolution = false,
    proxyBase,
    baseUrl,
  },
) {
  if (!imageUrl) return [];
  const safeKind = kind === "retailer" ? "retailer" : "product";
  const match = imageUrl.match(new RegExp(`/images/${safeKind}/([^/?#]+)`, "i"));
  if (!match) return [imageUrl];

  let id = match[1];
  let version = "";
  try {
    id = decodeURIComponent(id);
    version = new URL(imageUrl, baseUrl).searchParams.get("v") || "";
  } catch {
    // The catalogue ID still gives the server fallback enough information.
  }

  const sizes = [...new Set([size, ...fallbackSizes])]
    .map(Number)
    .filter((candidate) => Number.isFinite(candidate) && candidate >= 48);
  const versions = version ? [version, ""] : [""];
  const buildCacheUrl = (candidate, candidateVersion) => {
    const cacheSource = `api.posokanei.gov.gr/images/${safeKind}/${encodeURIComponent(id)}${
      candidateVersion ? `?v=${encodeURIComponent(candidateVersion)}` : ""
    }`;
    const cacheUrl = new URL("https://images.weserv.nl/");
    cacheUrl.searchParams.set("url", cacheSource);
    cacheUrl.searchParams.set("w", String(candidate));
    cacheUrl.searchParams.set(
      "h",
      String(safeKind === "retailer" ? Math.round(candidate / 2) : candidate),
    );
    cacheUrl.searchParams.set("fit", "contain");
    cacheUrl.searchParams.set("output", "webp");
    cacheUrl.searchParams.set("q", "82");
    return cacheUrl.toString();
  };
  const buildProxyUrl = (candidate, candidateVersion) => {
    const proxyUrl = new URL(proxyBase, baseUrl);
    proxyUrl.searchParams.set("resource", safeKind === "retailer" ? "retailer-image" : "image");
    proxyUrl.searchParams.set("id", id);
    proxyUrl.searchParams.set("size", String(candidate));
    if (candidateVersion) proxyUrl.searchParams.set("v", candidateVersion);
    return proxyUrl.toString();
  };

  const cacheUrls = sizes.flatMap((candidate) =>
    versions.map((candidateVersion) => buildCacheUrl(candidate, candidateVersion)),
  );
  const proxyUrls = sizes.flatMap((candidate) =>
    versions.map((candidateVersion) => buildProxyUrl(candidate, candidateVersion)),
  );

  return prioritizeResolution
    ? sizes.flatMap((candidate) => [
      ...versions.map((candidateVersion) => buildCacheUrl(candidate, candidateVersion)),
      ...versions.map((candidateVersion) => buildProxyUrl(candidate, candidateVersion)),
    ])
    : [...cacheUrls, ...proxyUrls];
}
