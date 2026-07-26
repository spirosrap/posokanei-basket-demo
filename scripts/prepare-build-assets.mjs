#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { precompressDirectory } from "./precompress-assets.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(projectRoot, "dist");
const packageJson = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));
const workerTemplate = await readFile(
  resolve(projectRoot, "scripts/service-worker.template.js"),
  "utf8",
);

await writeFile(
  resolve(distRoot, "sw.js"),
  workerTemplate.replaceAll("__APP_VERSION__", String(packageJson.version)),
  "utf8",
);

const variants = await precompressDirectory(distRoot, {
  include(filePath) {
    const buildPath = relative(distRoot, filePath).split(sep).join("/");
    return buildPath.startsWith("assets/")
      || buildPath === "data/catalog-bootstrap.json";
  },
});

const sourceBytes = new Map();
variants.forEach((variant) => {
  sourceBytes.set(variant.filePath.replace(/\.(?:br|gz)$/u, ""), variant.sourceBytes);
});
const rawBytes = [...sourceBytes.values()].reduce((sum, value) => sum + value, 0);
const brotliBytes = variants
  .filter((variant) => variant.encoding === "br")
  .reduce((sum, variant) => sum + variant.bytes, 0);
const gzipBytes = variants
  .filter((variant) => variant.encoding === "gzip")
  .reduce((sum, variant) => sum + variant.bytes, 0);

console.log(
  `Prepared service worker v${packageJson.version} and ${variants.length} compressed assets `
  + `(raw ${formatBytes(rawBytes)}, Brotli ${formatBytes(brotliBytes)}, gzip ${formatBytes(gzipBytes)}).`,
);

function formatBytes(value) {
  return `${(value / 1024).toFixed(1)} KiB`;
}
