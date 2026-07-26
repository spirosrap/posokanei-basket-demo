#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createPriceChangesPreviewPayload } from "./price-change-export.mjs";
import { writeCompressedVariants } from "./precompress-assets.mjs";

const inputPath = resolve(
  process.env.POSOKANEI_PRICE_CHANGES_JSON_OUT || "dist/data/price-changes.json",
);
const outputPath = resolve(
  process.env.POSOKANEI_PRICE_CHANGES_PREVIEW_OUT || "dist/data/price-changes-preview.json",
);
const payload = JSON.parse(await readFile(inputPath, "utf8"));
const preview = createPriceChangesPreviewPayload(payload);

await writeFile(outputPath, `${JSON.stringify(preview)}\n`, "utf8");
await writeCompressedVariants(outputPath);
console.log(
  `Wrote ${preview.changes.length} of ${preview.stats?.changes || payload.changes.length} changes to ${outputPath}`,
);
