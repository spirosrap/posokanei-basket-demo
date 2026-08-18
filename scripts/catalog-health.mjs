import { writeFile } from "node:fs/promises";
import { buildCatalogCoverageProfile } from "./catalog-publication-guard.mjs";

export function buildCatalogHealthSnapshot({ currentSnapshot, previousSnapshot = null }) {
  const current = buildCatalogCoverageProfile(currentSnapshot);
  if (!current.generated_at || !current.product_count) {
    throw new Error("The current catalogue cannot produce a health snapshot.");
  }

  const previous = previousSnapshot
    ? buildCatalogCoverageProfile(previousSnapshot)
    : null;

  return {
    schema_version: 1,
    generated_at: current.generated_at,
    source: String(currentSnapshot?.source || ""),
    current,
    previous: previous?.product_count ? previous : null,
  };
}

export async function writeCatalogHealthSnapshot(
  currentSnapshot,
  previousSnapshot,
  outputPath,
) {
  const health = buildCatalogHealthSnapshot({ currentSnapshot, previousSnapshot });
  await writeFile(outputPath, `${JSON.stringify(health)}\n`, "utf8");
  return health;
}
