#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { writeRuntimeCatalog } from "./catalog-runtime.mjs";

const inputPath = resolve(process.env.POSOKANEI_SNAPSHOT_IN || "public/data/catalog.json");
const outputPath = resolve(process.env.POSOKANEI_RUNTIME_OUT || "public/data/catalog-runtime.json");
const snapshot = JSON.parse(await readFile(inputPath, "utf8"));
const runtimeCatalog = await writeRuntimeCatalog(snapshot, outputPath);

console.log(`Wrote ${runtimeCatalog.products.length} compact products to ${outputPath}`);
