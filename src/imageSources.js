export function buildCatalogImageSources(
  imageUrl,
  { kind = "product", size = 96, proxyBase, baseUrl },
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

  const cacheSource = `api.posokanei.gov.gr/images/${safeKind}/${encodeURIComponent(id)}${
    version ? `?v=${encodeURIComponent(version)}` : ""
  }`;
  const cacheUrl = new URL("https://images.weserv.nl/");
  cacheUrl.searchParams.set("url", cacheSource);
  cacheUrl.searchParams.set("w", String(size));
  cacheUrl.searchParams.set("h", String(safeKind === "retailer" ? Math.round(size / 2) : size));
  cacheUrl.searchParams.set("fit", "contain");
  cacheUrl.searchParams.set("output", "webp");
  cacheUrl.searchParams.set("q", "82");

  const proxyUrl = new URL(proxyBase, baseUrl);
  proxyUrl.searchParams.set("resource", safeKind === "retailer" ? "retailer-image" : "image");
  proxyUrl.searchParams.set("id", id);
  proxyUrl.searchParams.set("size", String(size));
  if (version) proxyUrl.searchParams.set("v", version);

  return [cacheUrl.toString(), proxyUrl.toString()];
}
