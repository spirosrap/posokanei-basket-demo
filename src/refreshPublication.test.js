import assert from "node:assert/strict";
import test from "node:test";
import { publishRefreshTargets } from "../scripts/refresh-publication.mjs";

const targets = [{ name: "primary", required: true }, { name: "mirror", required: false }];

test("both catalogues are published before image maintenance starts", async () => {
  const calls = [];
  await publishRefreshTargets({
    targets,
    publishCatalog: async (target) => calls.push(`catalog:${target.name}`),
    publishImages: async (target) => calls.push(`images:${target.name}`),
    onMirrorError: assert.fail,
    onImageError: assert.fail,
  });
  assert.deepEqual(calls, ["catalog:primary", "catalog:mirror", "images:primary", "images:mirror"]);
});

test("image failure does not invalidate catalogues or prevent the next image target", async () => {
  const calls = [];
  await publishRefreshTargets({
    targets,
    publishCatalog: async (target) => calls.push(`catalog:${target.name}`),
    publishImages: async (target) => {
      calls.push(`images:${target.name}`);
      if (target.required) throw new Error("image timeout");
    },
    onMirrorError: assert.fail,
    onImageError: (target, error) => calls.push(`${target.name}:${error.message}`),
  });
  assert.deepEqual(calls, ["catalog:primary", "catalog:mirror", "images:primary", "primary:image timeout", "images:mirror"]);
});

test("primary catalogue failure stops publication, while mirror failure is isolated", async () => {
  await assert.rejects(publishRefreshTargets({
    targets,
    publishCatalog: async () => { throw new Error("primary failed"); },
    publishImages: assert.fail,
    onMirrorError: assert.fail,
    onImageError: assert.fail,
  }), /primary failed/);

  const calls = [];
  await publishRefreshTargets({
    targets,
    publishCatalog: async (target) => {
      if (!target.required) throw new Error("mirror failed");
    },
    publishImages: async (target) => calls.push(`images:${target.name}`),
    onMirrorError: (target) => calls.push(`failed:${target.name}`),
    onImageError: assert.fail,
  });
  assert.deepEqual(calls, ["failed:mirror", "images:primary"]);
});
