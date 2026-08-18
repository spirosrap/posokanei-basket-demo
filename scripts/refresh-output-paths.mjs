import { resolve } from "node:path";

const OUTPUT_FILES = Object.freeze({
  snapshotPath: ["POSOKANEI_SNAPSHOT_OUT", "catalog.json"],
  metaPath: ["POSOKANEI_META_OUT", "catalog-meta.json"],
  runtimePath: ["POSOKANEI_RUNTIME_OUT", "catalog-runtime.json"],
  bootstrapPath: ["POSOKANEI_BOOTSTRAP_OUT", "catalog-bootstrap.json"],
  priceChangesPath: ["POSOKANEI_PRICE_CHANGES_OUT", "price-changes.csv"],
  priceChangesJsonPath: ["POSOKANEI_PRICE_CHANGES_JSON_OUT", "price-changes.json"],
  priceChangesPreviewPath: [
    "POSOKANEI_PRICE_CHANGES_PREVIEW_OUT",
    "price-changes-preview.json",
  ],
  priceChangesGzipPath: ["POSOKANEI_PRICE_CHANGES_GZIP_OUT", "price-changes.json.gz"],
  productDetailsPath: ["POSOKANEI_PRODUCT_DETAILS_OUT", "catalog-details.jsonl"],
  catalogHealthPath: ["POSOKANEI_CATALOG_HEALTH_OUT", "catalog-health.json"],
  refreshStatusPath: ["POSOKANEI_REFRESH_STATUS_OUT", "refresh-status.json"],
  dailyBargainPath: ["POSOKANEI_BARGAIN_OUT", "daily-bargain.json"],
});

export function resolveRefreshOutputPaths({
  projectRoot,
  env = process.env,
  compressionOnly = false,
}) {
  const defaultDirectory = compressionOnly
    ? "dist/data"
    : ".cache/catalog-refresh-output";

  return Object.fromEntries(
    Object.entries(OUTPUT_FILES).map(([name, [environmentKey, fileName]]) => [
      name,
      resolve(projectRoot, env[environmentKey] || `${defaultDirectory}/${fileName}`),
    ]),
  );
}
