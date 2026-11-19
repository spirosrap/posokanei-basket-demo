import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { writeCatalogBootstrap } from "./catalog-bootstrap.mjs";
import { writeRuntimeCatalog } from "./catalog-runtime.mjs";
import {
  writePriceChangesCsv,
  writePriceChangesJson,
  writePriceChangesPreviewJson,
} from "./price-change-export.mjs";
import { annotatePriceChanges } from "./price-change-history.mjs";

export async function writeSnapshotFiles(rawSnapshot, previousSnapshot, {
  outputPath, metaOutputPath, runtimeOutputPath, bootstrapOutputPath, priceChangesOutputPath, priceChangesJsonOutputPath, priceChangesPreviewOutputPath,
}) {
  const { stats, products } = rawSnapshot;
  const { snapshot, stats: priceChangeStats } = annotatePriceChanges(
    rawSnapshot,
    previousSnapshot,
  );
  const metadata = {
    generated_at: snapshot.generated_at,
    source: snapshot.source,
    stats: {
      ...stats,
      total_products: products.length || stats.total_products,
      active_products: products.length || stats.active_products || stats.total_products,
    },
    categories: snapshot.categories,
    retailers: snapshot.retailers,
    coverage: snapshot.coverage,
    price_change_stats: priceChangeStats,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot)}\n`, "utf8");
  await mkdir(dirname(metaOutputPath), { recursive: true });
  await writeFile(metaOutputPath, `${JSON.stringify(metadata)}\n`, "utf8");
  const runtimeCatalog = await writeRuntimeCatalog(snapshot, runtimeOutputPath);
  await writeCatalogBootstrap(runtimeCatalog, bootstrapOutputPath);
  const exportedPriceChanges = await writePriceChangesCsv(snapshot, priceChangesOutputPath);
  await writePriceChangesJson(snapshot, priceChangesJsonOutputPath);
  await writePriceChangesPreviewJson(snapshot, priceChangesPreviewOutputPath);

  console.log(
    `Wrote ${products.length} products, ${snapshot.categories.length} categories, ${snapshot.retailers.length} retailers to ${outputPath}`,
  );
  console.log(`Wrote catalogue metadata to ${metaOutputPath}`);
  console.log(`Wrote compact runtime catalogue to ${runtimeOutputPath}`);
  console.log(`Wrote static startup catalogue to ${bootstrapOutputPath}`);
  console.log(`Wrote ${exportedPriceChanges} price changes to ${priceChangesOutputPath}`);
  console.log(`Wrote price-change display data to ${priceChangesJsonOutputPath}`);
  console.log(`Wrote initial price-change preview to ${priceChangesPreviewOutputPath}`);
  console.log(
    `Price changes: ${priceChangeStats.new_changes} new, ${priceChangeStats.active_offers} active across ${priceChangeStats.products_with_recent_changes} products`,
  );
}
