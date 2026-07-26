import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import {
  shouldPrecompress,
  writeCompressedVariants,
} from "../scripts/precompress-assets.mjs";

test("precompressed assets round-trip through Brotli and gzip", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kalathi-compress-"));
  const sourcePath = join(directory, "catalog.json");
  const source = Buffer.from(JSON.stringify({ products: Array(400).fill("cottage cheese") }));

  try {
    await writeFile(sourcePath, source);
    const variants = await writeCompressedVariants(sourcePath);

    assert.deepEqual(variants.map((variant) => variant.encoding), ["br", "gzip"]);
    assert.deepEqual(brotliDecompressSync(await readFile(`${sourcePath}.br`)), source);
    assert.deepEqual(gunzipSync(await readFile(`${sourcePath}.gz`)), source);
    assert.ok(variants.every((variant) => variant.bytes < variant.sourceBytes));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("precompression ignores small and unsupported files", () => {
  assert.equal(shouldPrecompress("index.js", 4096), true);
  assert.equal(shouldPrecompress("index.js.gz", 4096), false);
  assert.equal(shouldPrecompress("index.html", 4096), false);
  assert.equal(shouldPrecompress("small.css", 800), false);
});
