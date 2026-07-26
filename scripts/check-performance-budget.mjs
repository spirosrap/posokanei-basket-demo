#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";

const distRoot = resolve("dist");
const assetsRoot = resolve(distRoot, "assets");
const html = await readFile(resolve(distRoot, "index.html"), "utf8");
const mainAsset = html.match(/(?:src|href)="[^"]*assets\/(index-[^"]+\.js)"/u)?.[1];

if (!mainAsset) throw new Error("Performance budget could not identify the main application bundle.");

const routeAssets = (await readdir(assetsRoot))
  .filter((name) => /^PriceChangesPage-.*\.js$/u.test(name));
if (routeAssets.length !== 1) {
  throw new Error(`Expected one lazy price-changes bundle, found ${routeAssets.length}.`);
}

const budgets = [
  { name: mainAsset, maxRaw: 250 * 1024, maxBrotli: 64 * 1024 },
  { name: routeAssets[0], maxRaw: 32 * 1024, maxBrotli: 11 * 1024 },
];

for (const budget of budgets) {
  const rawPath = resolve(assetsRoot, budget.name);
  const brotliPath = `${rawPath}.br`;
  const [raw, brotli] = await Promise.all([stat(rawPath), stat(brotliPath)]);
  if (raw.size > budget.maxRaw) {
    throw new Error(`${budget.name} is ${formatBytes(raw.size)} raw; budget is ${formatBytes(budget.maxRaw)}.`);
  }
  if (brotli.size > budget.maxBrotli) {
    throw new Error(`${budget.name} is ${formatBytes(brotli.size)} Brotli; budget is ${formatBytes(budget.maxBrotli)}.`);
  }
  console.log(
    `${basename(budget.name)}: ${formatBytes(raw.size)} raw, ${formatBytes(brotli.size)} Brotli`,
  );
}

function formatBytes(value) {
  return `${(value / 1024).toFixed(1)} KiB`;
}
