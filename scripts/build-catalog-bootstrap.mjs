#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { writeCatalogBootstrap } from "./catalog-bootstrap.mjs";

const inputPath = resolve(
  process.env.POSOKANEI_RUNTIME_IN || "public/data/catalog-runtime.json",
);
const outputPath = resolve(
  process.env.POSOKANEI_BOOTSTRAP_OUT || "public/data/catalog-bootstrap.json",
);
const runtimeCatalog = JSON.parse(await readFile(inputPath, "utf8"));
const bootstrap = await writeCatalogBootstrap(runtimeCatalog, outputPath);

console.log(
  `Wrote ${bootstrap.products.length} startup products for ${bootstrap.total_products} catalogue products to ${outputPath}`,
);
