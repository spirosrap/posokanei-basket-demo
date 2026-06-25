#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadLocalEnv(resolve(projectRoot, ".env.local"));

const snapshotPath = resolve(
  projectRoot,
  process.env.POSOKANEI_SNAPSHOT_OUT || "dist/data/catalog.json",
);
const metaPath = resolve(
  projectRoot,
  process.env.POSOKANEI_META_OUT || "dist/data/catalog-meta.json",
);
const refreshStatusPath = resolve(
  projectRoot,
  process.env.POSOKANEI_REFRESH_STATUS_OUT || "dist/data/refresh-status.json",
);
const uploadEnabled = !process.argv.includes("--no-upload");
const ftpHost = requiredEnv("FTP_HOST");
const ftpRemoteDir = trimSlashes(requiredEnv("FTP_REMOTE_DIR"));
const ftpUser = requiredEnv("FTP_USER");
const keychainService = process.env.FTP_KEYCHAIN_SERVICE || "";
const remoteRefreshHost = process.env.POSOKANEI_REFRESH_HOST || "";
const minimumProducts = Number(process.env.POSOKANEI_MIN_PRODUCTS || 1000);
const publicCatalogUrl =
  process.env.POSOKANEI_PUBLIC_CATALOG_URL ||
  `https://${ftpHost}/${ftpRemoteDir}/data/catalog.json`;
const publicMetaUrl =
  process.env.POSOKANEI_PUBLIC_META_URL || publicCatalogUrl.replace(/catalog\.json$/, "catalog-meta.json");
const publicRefreshStatusUrl =
  process.env.POSOKANEI_PUBLIC_REFRESH_STATUS_URL ||
  publicCatalogUrl.replace(/catalog\.json$/, "refresh-status.json");

try {
  await refreshCatalog();
} catch (error) {
  await recordRefreshFailure(error);
  throw error;
}

async function refreshCatalog() {
  if (remoteRefreshHost) {
    await buildSnapshotOnRemoteHost(remoteRefreshHost);
  } else {
    await runNodeScript("scripts/build-catalog-snapshot.mjs", {
      POSOKANEI_SNAPSHOT_OUT: snapshotPath,
      POSOKANEI_META_OUT: metaPath,
    });
  }

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

  await writeRefreshStatus({
    status: "ok",
    checked_at: new Date().toISOString(),
    generated_at: snapshot.generated_at,
    product_count: productCount,
  });

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
    await uploadFile(refreshStatusPath, `ftp://${ftpHost}/${ftpRemoteDir}/data/refresh-status.json`, {
      user: ftpUser,
      password,
    });
    await verifyPublicRefreshFiles(snapshot.generated_at);
  } else {
    console.log("Upload skipped because --no-upload was passed.");
  }
}

async function buildSnapshotOnRemoteHost(host) {
  const remoteDir = `/tmp/posokanei-basket-refresh-${Date.now()}`;
  const remoteScript = `${remoteDir}/build-catalog-snapshot.mjs`;
  const remoteSnapshot = `${remoteDir}/catalog.json`;
  const remoteMeta = `${remoteDir}/catalog-meta.json`;
  const sshOptions = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15"];

  await mkdir(dirname(snapshotPath), { recursive: true });
  await mkdir(dirname(metaPath), { recursive: true });

  try {
    await run("ssh", [...sshOptions, host, `rm -rf ${shellQuote(remoteDir)} && mkdir -p ${shellQuote(remoteDir)}`]);
    await run("scp", [
      ...sshOptions,
      resolve(projectRoot, "scripts/build-catalog-snapshot.mjs"),
      `${host}:${remoteScript}`,
    ]);
    await run("ssh", [
      ...sshOptions,
      host,
      [
        `POSOKANEI_SNAPSHOT_OUT=${shellQuote(remoteSnapshot)}`,
        `POSOKANEI_META_OUT=${shellQuote(remoteMeta)}`,
        `node ${shellQuote(remoteScript)}`,
      ].join(" "),
    ]);
    await run("scp", [...sshOptions, `${host}:${remoteSnapshot}`, snapshotPath]);
    await run("scp", [...sshOptions, `${host}:${remoteMeta}`, metaPath]);
  } finally {
    await run("ssh", [...sshOptions, host, `rm -rf ${shellQuote(remoteDir)}`], {
      allowFailure: true,
      quiet: true,
    });
  }
}

async function recordRefreshFailure(error) {
  const previous = await readPreviousSnapshotSummary();
  const status = {
    status: "failed",
    checked_at: new Date().toISOString(),
    generated_at: previous.generated_at || "",
    product_count: previous.product_count || 0,
    error: describeRefreshError(error),
  };
  await writeRefreshStatus(status);

  if (!uploadEnabled) return;

  try {
    const password = process.env.FTP_PASS || (await readKeychainPassword());
    await uploadFile(refreshStatusPath, `ftp://${ftpHost}/${ftpRemoteDir}/data/refresh-status.json`, {
      user: ftpUser,
      password,
    });
  } catch (uploadError) {
    console.error(`Could not upload refresh failure status: ${describeRefreshError(uploadError)}`);
  }
}

async function readPreviousSnapshotSummary() {
  try {
    const response = await fetch(`${publicMetaUrl}?v=${Date.now()}`, {
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      const meta = await response.json();
      return snapshotSummaryFromMeta(meta);
    }
  } catch {
    // Fall through to local files when the public metadata is unavailable.
  }

  try {
    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    return snapshotSummaryFromMeta(meta);
  } catch {
    // Fall through to the full snapshot when metadata is unavailable.
  }

  try {
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
    return {
      generated_at: snapshot.generated_at || "",
      product_count: Array.isArray(snapshot.products) ? snapshot.products.length : 0,
    };
  } catch {
    return {};
  }
}

function snapshotSummaryFromMeta(meta) {
  return {
    generated_at: meta?.generated_at || "",
    product_count: Number(meta?.stats?.active_products || meta?.stats?.total_products || 0) || 0,
  };
}

async function writeRefreshStatus(status) {
  await mkdir(dirname(refreshStatusPath), { recursive: true });
  await writeFile(refreshStatusPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
}

function describeRefreshError(error) {
  const message = String(error?.message || error || "Catalogue refresh failed.");
  const httpMatch = message.match(/returned HTTP (\d+)/);
  const endpointMatch = message.match(/Error: (\/[^\\s]+) returned HTTP \d+/);
  if (httpMatch && endpointMatch) {
    return `${endpointMatch[1]} returned HTTP ${httpMatch[1]}`;
  }
  if (httpMatch) {
    return `Upstream returned HTTP ${httpMatch[1]}`;
  }
  return "Catalogue refresh failed.";
}

function loadLocalEnv(envPath) {
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue
      .replace(/^['"]|['"]$/g, "")
      .replace(/\\n/g, "\n");
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set in the environment or .env.local.`);
  }
  return value;
}

async function runNodeScript(script, extraEnv = {}) {
  await run(process.execPath, [resolve(projectRoot, script)], {
    cwd: projectRoot,
    env: { ...process.env, ...extraEnv },
  });
}

async function readKeychainPassword() {
  if (!keychainService) {
    throw new Error("FTP_PASS or FTP_KEYCHAIN_SERVICE must be set in the environment or .env.local.");
  }
  const { stdout } = await run("/usr/bin/security", [
    "find-generic-password",
    "-s",
    keychainService,
    "-a",
    ftpUser,
    "-w",
  ], { quiet: true });
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

async function fetchPublicJson(url) {
  const response = await fetch(`${url}?v=${Date.now()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`${url} verification returned HTTP ${response.status}.`);
  }
  return response.json();
}

async function verifyPublicRefreshFiles(expectedGeneratedAt) {
  const publicSnapshot = await fetchPublicJson(publicCatalogUrl);
  if (publicSnapshot.generated_at !== expectedGeneratedAt) {
    throw new Error(
      `Public snapshot verification mismatch: expected ${expectedGeneratedAt}, got ${publicSnapshot.generated_at}.`,
    );
  }

  const publicMeta = await fetchPublicJson(publicMetaUrl);
  if (publicMeta.generated_at !== expectedGeneratedAt) {
    throw new Error(
      `Public metadata verification mismatch: expected ${expectedGeneratedAt}, got ${publicMeta.generated_at}.`,
    );
  }

  const publicRefreshStatus = await fetchPublicJson(publicRefreshStatusUrl);
  if (publicRefreshStatus.generated_at !== expectedGeneratedAt) {
    throw new Error(
      `Public refresh-status verification mismatch: expected ${expectedGeneratedAt}, got ${publicRefreshStatus.generated_at}.`,
    );
  }

  console.log(`Verified public catalogue at ${publicCatalogUrl}`);
  console.log(`Verified public metadata at ${publicMetaUrl}`);
  console.log(`Verified public refresh status at ${publicRefreshStatusUrl}`);
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
      if (!options.quiet) process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (!options.quiet) process.stderr.write(chunk);
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun({ stdout, stderr });
        return;
      }
      if (options.allowFailure) {
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

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
