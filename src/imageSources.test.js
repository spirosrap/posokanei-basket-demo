import test from "node:test";
import assert from "node:assert/strict";
import { buildCatalogImageSources } from "./imageSources.js";

const options = {
  proxyBase: "/api/posokanei.php",
  baseUrl: "https://kalathitimon.com/",
};

test("catalogue images use the edge cache before the same-origin fallback", () => {
  const [edge, fallback] = buildCatalogImageSources(
    "https://api.posokanei.gov.gr/images/product/product-1?v=revision-2",
    { ...options, size: 96 },
  );

  const edgeUrl = new URL(edge);
  assert.equal(edgeUrl.hostname, "images.weserv.nl");
  assert.equal(edgeUrl.searchParams.get("url"), "api.posokanei.gov.gr/images/product/product-1?v=revision-2");
  assert.equal(edgeUrl.searchParams.get("w"), "96");

  const fallbackUrl = new URL(fallback);
  assert.equal(fallbackUrl.origin, "https://kalathitimon.com");
  assert.equal(fallbackUrl.searchParams.get("resource"), "image");
  assert.equal(fallbackUrl.searchParams.get("id"), "product-1");
  assert.equal(fallbackUrl.searchParams.get("v"), "revision-2");
});

test("retailer logos keep their aspect ratio and external images pass through", () => {
  const [edge] = buildCatalogImageSources(
    "https://api.posokanei.gov.gr/images/retailer/lidl",
    { ...options, kind: "retailer", size: 240 },
  );
  const edgeUrl = new URL(edge);
  assert.equal(edgeUrl.searchParams.get("h"), "120");

  assert.deepEqual(
    buildCatalogImageSources("https://example.com/logo.svg", {
      ...options,
      kind: "retailer",
      size: 240,
    }),
    ["https://example.com/logo.svg"],
  );
});

test("large product previews fall back to an already cached thumbnail size", () => {
  const sources = buildCatalogImageSources(
    "https://api.posokanei.gov.gr/images/product/product-1?v=revision-2",
    { ...options, size: 640, fallbackSizes: [96] },
  );

  assert.deepEqual(
    sources.map((source) => {
      const url = new URL(source);
      return [url.hostname, url.searchParams.get("size") || url.searchParams.get("w")];
    }),
    [
      ["images.weserv.nl", "640"],
      ["images.weserv.nl", "96"],
      ["kalathitimon.com", "640"],
      ["kalathitimon.com", "96"],
    ],
  );
});
