#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";

const distRoot = resolve("dist");
const assetsRoot = resolve(distRoot, "assets");
const html = await readFile(resolve(distRoot, "index.html"), "utf8");
const mainAsset = html.match(/(?:src|href)="[^"]*assets\/(index-[^"]+\.js)"/u)?.[1];

if (!mainAsset) throw new Error("Performance budget could not identify the main application bundle.");

const assetNames = await readdir(assetsRoot);
const routeAssets = assetNames.filter((name) => /^PriceChangesPage-.*\.js$/u.test(name));
if (routeAssets.length !== 1) {
  throw new Error(`Expected one lazy price-changes bundle, found ${routeAssets.length}.`);
}
const healthRouteAssets = assetNames.filter((name) => /^CatalogHealthPage-.*\.js$/u.test(name));
if (healthRouteAssets.length !== 1) {
  throw new Error(`Expected one lazy catalogue-health bundle, found ${healthRouteAssets.length}.`);
}
const vendorAssets = assetNames.filter((name) => /^ui-vendor-.*\.js$/u.test(name));
if (vendorAssets.length !== 1) {
  throw new Error(`Expected one stable UI vendor bundle, found ${vendorAssets.length}.`);
}

const budgets = [
  { name: mainAsset, maxRaw: 225 * 1024, maxBrotli: 54 * 1024 },
  { name: vendorAssets[0], maxRaw: 40 * 1024, maxBrotli: 13 * 1024 },
  { name: routeAssets[0], maxRaw: 32 * 1024, maxBrotli: 11 * 1024 },
  { name: healthRouteAssets[0], maxRaw: 20 * 1024, maxBrotli: 7 * 1024 },
];

let startupBrotli = 0;

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
  if (budget.name === mainAsset || budget.name === vendorAssets[0]) {
    startupBrotli += brotli.size;
  }
  console.log(
    `${basename(budget.name)}: ${formatBytes(raw.size)} raw, ${formatBytes(brotli.size)} Brotli`,
  );
}

if (startupBrotli > 64 * 1024) {
  throw new Error(
    `Combined startup JavaScript is ${formatBytes(startupBrotli)} Brotli; budget is 64.0 KiB.`,
  );
}
console.log(`Combined startup JavaScript: ${formatBytes(startupBrotli)} Brotli`);

function formatBytes(value) {
  return `${(value / 1024).toFixed(1)} KiB`;
}
