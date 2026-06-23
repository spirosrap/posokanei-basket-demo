#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = resolve(
  projectRoot,
  process.env.POSOKANEI_SNAPSHOT_OUT || "dist/data/catalog.json",
);
const metaPath = resolve(
  projectRoot,
  process.env.POSOKANEI_META_OUT || "dist/data/catalog-meta.json",
);
const uploadEnabled = !process.argv.includes("--no-upload");
const ftpHost = process.env.FTP_HOST || "agenticspiros.com";
const ftpRemoteDir = trimSlashes(process.env.FTP_REMOTE_DIR || "demo/posokanei-basket");
const ftpUser = process.env.FTP_USER || "agenticspirosftp";
const keychainService = process.env.FTP_KEYCHAIN_SERVICE || "Plesk FTP agenticspiros.com";
const minimumProducts = Number(process.env.POSOKANEI_MIN_PRODUCTS || 1000);
const publicCatalogUrl =
  process.env.POSOKANEI_PUBLIC_CATALOG_URL ||
  `https://${ftpHost}/${ftpRemoteDir}/data/catalog.json`;

await runNodeScript("scripts/build-catalog-snapshot.mjs", {
  POSOKANEI_SNAPSHOT_OUT: snapshotPath,
  POSOKANEI_META_OUT: metaPath,
});

const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
const productCount = Array.isArray(snapshot.products) ? snapshot.products.length : 0;
if (productCount < minimumProducts) {
  throw new Error(
    `Snapshot guard failed: expected at least ${minimumProducts} products, got ${productCount}.`,
  );
}

console.log(
  `Snapshot ready: ${productCount.toLocaleString("en-US")} products generated_at=${snapshot.generated_at}`,
);

if (uploadEnabled) {
  const password = process.env.FTP_PASS || (await readKeychainPassword());
  await uploadFile(snapshotPath, `ftp://${ftpHost}/${ftpRemoteDir}/data/catalog.json`, {
    user: ftpUser,
    password,
  });
  await uploadFile(metaPath, `ftp://${ftpHost}/${ftpRemoteDir}/data/catalog-meta.json`, {
    user: ftpUser,
    password,
  });
  await verifyPublicSnapshot(snapshot.generated_at);
} else {
  console.log("Upload skipped because --no-upload was passed.");
}

async function runNodeScript(script, extraEnv = {}) {
  await run(process.execPath, [resolve(projectRoot, script)], {
    cwd: projectRoot,
    env: { ...process.env, ...extraEnv },
  });
}

async function readKeychainPassword() {
  const { stdout } = await run("/usr/bin/security", [
    "find-generic-password",
    "-s",
    keychainService,
    "-a",
    ftpUser,
    "-w",
  ]);
  const password = stdout.trim();
  if (!password) {
    throw new Error("The FTP password was not found in Keychain and FTP_PASS was not set.");
  }
  return password;
}

async function uploadFile(filePath, url, credentials) {
  const curlConfig = [
    `user = "${escapeCurlConfig(`${credentials.user}:${credentials.password}`)}"`,
    "ftp-create-dirs",
    "silent",
    "show-error",
    "fail",
  ].join("\n");

  await run("/usr/bin/curl", ["--config", "-", "-T", filePath, url], {
    input: `${curlConfig}\n`,
  });
  console.log(`Uploaded fresh catalogue to ${url.replace(/^ftp:\/\//, "ftp://***@")}`);
}

async function verifyPublicSnapshot(expectedGeneratedAt) {
  const response = await fetch(`${publicCatalogUrl}?v=${Date.now()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Public snapshot verification returned HTTP ${response.status}.`);
  }
  const publicSnapshot = await response.json();
  if (publicSnapshot.generated_at !== expectedGeneratedAt) {
    throw new Error(
      `Public snapshot verification mismatch: expected ${expectedGeneratedAt}, got ${publicSnapshot.generated_at}.`,
    );
  }
  console.log(`Verified public catalogue at ${publicCatalogUrl}`);
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd || projectRoot,
      env: options.env || process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun({ stdout, stderr });
        return;
      }
      rejectRun(new Error(`${command} exited with ${code}: ${stderr || stdout}`));
    });
    if (options.input) {
      child.stdin.end(options.input);
    } else {
      child.stdin.end();
    }
  });
}

function trimSlashes(value) {
  return String(value).replace(/^\/+|\/+$/g, "");
}

function escapeCurlConfig(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
