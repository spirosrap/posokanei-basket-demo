import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { promisify } from "node:util";
import {
  brotliCompress,
  constants as zlibConstants,
  gzip,
} from "node:zlib";

const brotliCompressAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

const DEFAULT_EXTENSIONS = new Set([
  ".css",
  ".csv",
  ".js",
  ".json",
  ".jsonl",
  ".svg",
]);

export function shouldPrecompress(
  filePath,
  byteLength,
  { minBytes = 1024, extensions = DEFAULT_EXTENSIONS } = {},
) {
  if (!Number.isFinite(byteLength) || byteLength < minBytes) return false;
  if (/\.(?:br|gz)$/u.test(filePath)) return false;
  return extensions.has(extname(filePath).toLocaleLowerCase("en-US"));
}

export async function writeCompressedVariants(
  filePath,
  {
    minBytes = 1024,
    brotliPath = `${filePath}.br`,
    gzipPath = `${filePath}.gz`,
  } = {},
) {
  const source = await readFile(filePath);
  if (!shouldPrecompress(filePath, source.length, { minBytes })) return [];

  const [brotli, gzipped] = await Promise.all([
    brotliCompressAsync(source, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
        [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
      },
    }),
    gzipAsync(source, { level: 9 }),
  ]);

  const variants = [
    { encoding: "br", filePath: brotliPath, contents: brotli },
    { encoding: "gzip", filePath: gzipPath, contents: gzipped },
  ].filter((variant) => variant.contents.length < source.length);

  await Promise.all(variants.map(async (variant) => {
    await mkdir(dirname(variant.filePath), { recursive: true });
    await writeFile(variant.filePath, variant.contents);
  }));

  return variants.map(({ encoding, filePath: outputPath, contents }) => ({
    encoding,
    filePath: outputPath,
    bytes: contents.length,
    sourceBytes: source.length,
  }));
}

export async function precompressDirectory(
  directory,
  { include = () => true, minBytes = 1024 } = {},
) {
  const files = await listFiles(directory);
  const selected = [];

  for (const filePath of files) {
    if (!include(filePath)) continue;
    const details = await stat(filePath);
    if (shouldPrecompress(filePath, details.size, { minBytes })) {
      selected.push(filePath);
    }
  }

  const nestedResults = [];
  for (const filePath of selected) {
    nestedResults.push(await writeCompressedVariants(filePath, { minBytes }));
  }
  return nestedResults.flat();
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return nested.flat();
}
