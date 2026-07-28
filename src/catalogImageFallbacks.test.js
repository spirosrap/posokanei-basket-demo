import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  cacheMissingCatalogImages,
  detectImageFormat,
  imageFallbackFileName,
  normalizeImageCandidate,
  selectImageFallbackCandidates,
} from "../scripts/catalog-image-fallbacks.mjs";

function product(id, version = `version-${id}`) {
  return {
    id,
    image_url: `https://api.posokanei.gov.gr/images/product/${id}?v=${version}`,
    image_version: version,
  };
}

test("image fallback candidates prioritize visible products and rotate through the catalogue", () => {
  const snapshot = { products: [product("a"), product("b"), product("c"), product("d")] };
  const preview = { products: { b: ["B"] } };
  const bootstrap = { products: [{ id: "c" }] };
  const selection = selectImageFallbackCandidates({
    snapshot,
    preview,
    bootstrap,
    cursor: 3,
    rotationLimit: 2,
  });

  assert.deepEqual(selection.candidates.map(({ id }) => id), ["b", "c", "d", "a"]);
  assert.equal(selection.priorityCount, 2);
  assert.equal(selection.rotationCount, 2);
  assert.equal(selection.nextCursor, 1);
});

test("deep recent-change products use an independent rotating window", () => {
  const snapshot = {
    products: [product("a"), product("b"), product("c"), product("d"), product("e")],
  };
  const selection = selectImageFallbackCandidates({
    snapshot,
    preview: { products: { b: ["B"] } },
    bootstrap: { products: [] },
    recentChanges: { products: { b: [], d: [], e: [] } },
    forcedIds: ["c"],
    cursor: 0,
    recentCursor: 1,
    rotationLimit: 2,
    recentRotationLimit: 2,
  });

  assert.deepEqual(
    selection.candidates.map(({ id }) => id),
    ["c", "b", "d", "e", "a"],
  );
  assert.equal(selection.priorityCount, 2);
  assert.equal(selection.recentRotationCount, 2);
  assert.equal(selection.catalogRotationCount, 1);
  assert.equal(selection.nextRecentCursor, 0);
  assert.equal(selection.nextCursor, 2);
});

test("only official product image URLs become fallback candidates", () => {
  assert.equal(normalizeImageCandidate({
    id: "product-1",
    image_url: "https://example.com/product.jpg",
  }), null);
  assert.equal(normalizeImageCandidate({
    id: "../unsafe",
    image_url: "https://api.posokanei.gov.gr/images/product/unsafe",
  }), null);
  assert.deepEqual(normalizeImageCandidate(product("product-1", "revision-2")), {
    id: "product-1",
    version: "revision-2",
    imageUrl: "https://api.posokanei.gov.gr/images/product/product-1?v=revision-2",
  });
});

test("image fallback files use validated raster formats and immutable versions", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, ...Array(20).fill(0)]);
  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
  const webp = Buffer.from("524946460000000057454250", "hex");

  assert.deepEqual(detectImageFormat(jpeg), {
    extension: "jpg",
    contentType: "image/jpeg",
  });
  assert.deepEqual(detectImageFormat(png), {
    extension: "png",
    contentType: "image/png",
  });
  assert.deepEqual(detectImageFormat(webp), {
    extension: "webp",
    contentType: "image/webp",
  });
  assert.equal(
    imageFallbackFileName(
      { id: "product-1", version: "revision-2" },
      { extension: "jpg" },
    ),
    "product-1-revision-2.jpg",
  );
});

test("a missing public image is cached from the official source", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kalathi-image-fallback-"));
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, ...Array(150).fill(1)]);
  const candidate = normalizeImageCandidate(product("product-1", "revision-2"));
  const calls = [];
  const fetcher = async (url) => {
    calls.push(String(url));
    if (String(url).startsWith("https://kalathitimon.com/")) {
      return new Response("missing", { status: 502, headers: { "content-type": "text/plain" } });
    }
    return new Response(jpeg, { status: 200, headers: { "content-type": "image/jpeg" } });
  };

  try {
    const result = await cacheMissingCatalogImages({
      candidates: [candidate],
      proxyUrls: ["https://kalathitimon.com/api/posokanei.php"],
      outputDirectory: directory,
      concurrency: 1,
      fetcher,
    });

    assert.equal(result.files.length, 1);
    assert.equal(result.failures.length, 0);
    assert.equal(result.files[0].fileName, "product-1-revision-2.jpg");
    assert.deepEqual(await readFile(result.files[0].filePath), jpeg);
    assert.equal(calls.at(-1), candidate.imageUrl);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("temporary image placeholders are not cached after a fallback becomes available", async () => {
  const source = await readFile(
    new URL("../public/api/posokanei.php", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /http_response_code\(502\);[\s\S]*Cache-Control: no-store, max-age=0[\s\S]*X-Posokanei-Image-Source: unavailable/u,
  );
});
