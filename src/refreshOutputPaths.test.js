import assert from "node:assert/strict";
import test from "node:test";
import { resolveRefreshOutputPaths } from "../scripts/refresh-output-paths.mjs";

test("normal catalogue refresh output is isolated from application builds", () => {
  const paths = resolveRefreshOutputPaths({
    projectRoot: "/tmp/kalathi-project",
    env: {},
  });

  assert.equal(
    paths.snapshotPath,
    "/tmp/kalathi-project/.cache/catalog-refresh-output/catalog.json",
  );
  assert.equal(
    paths.priceChangesPath,
    "/tmp/kalathi-project/.cache/catalog-refresh-output/price-changes.csv",
  );
  assert.ok(Object.values(paths).every((value) => !value.includes("/dist/")));
});

test("compression recovery retains dist defaults and explicit overrides", () => {
  const compressionPaths = resolveRefreshOutputPaths({
    projectRoot: "/tmp/kalathi-project",
    env: {},
    compressionOnly: true,
  });
  const overriddenPaths = resolveRefreshOutputPaths({
    projectRoot: "/tmp/kalathi-project",
    env: { POSOKANEI_SNAPSHOT_OUT: "/tmp/custom-catalog.json" },
  });

  assert.equal(
    compressionPaths.snapshotPath,
    "/tmp/kalathi-project/dist/data/catalog.json",
  );
  assert.equal(overriddenPaths.snapshotPath, "/tmp/custom-catalog.json");
});
