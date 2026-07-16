#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { mkdir, open, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { uploadFileAtomic } from "./ftp-atomic-upload.mjs";

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
const runtimePath = resolve(
  projectRoot,
  process.env.POSOKANEI_RUNTIME_OUT || "dist/data/catalog-runtime.json",
);
const bootstrapPath = resolve(
  projectRoot,
  process.env.POSOKANEI_BOOTSTRAP_OUT || "dist/data/catalog-bootstrap.json",
);
const refreshStatusPath = resolve(
  projectRoot,
  process.env.POSOKANEI_REFRESH_STATUS_OUT || "dist/data/refresh-status.json",
);
const dailyBargainPath = resolve(
  projectRoot,
  process.env.POSOKANEI_BARGAIN_OUT || "dist/data/daily-bargain.json",
);
const uploadEnabled = !process.argv.includes("--no-upload");
const ftpTargets = buildFtpTargets();
const primaryTarget = ftpTargets[0];
const remoteRefreshHost = process.env.POSOKANEI_REFRESH_HOST || "";
const remoteRefreshHosts = parseRefreshHosts(
  process.env.POSOKANEI_REFRESH_HOSTS || remoteRefreshHost,
);
const minimumProducts = Number(process.env.POSOKANEI_MIN_PRODUCTS || 1000);
const publicCatalogUrl =
  process.env.POSOKANEI_PUBLIC_CATALOG_URL ||
  publicDataUrl(primaryTarget, "catalog.json");
const publicMetaUrl =
  process.env.POSOKANEI_PUBLIC_META_URL || publicCatalogUrl.replace(/catalog\.json$/, "catalog-meta.json");
const refreshLockPath = resolve(
  projectRoot,
  process.env.POSOKANEI_REFRESH_LOCK || ".cache/catalog-refresh.lock",
);

const releaseRefreshLock = await acquireRefreshLock(refreshLockPath);
if (!releaseRefreshLock) {
  console.log("Another catalogue refresh is already running; this overlapping run was skipped.");
} else {
  try {
    await refreshCatalog();
  } catch (error) {
    await recordRefreshFailure(error);
    throw error;
  } finally {
    await releaseRefreshLock();
  }
}

async function acquireRefreshLock(lockPath, retried = false) {
  await mkdir(dirname(lockPath), { recursive: true });
  try {
    const handle = await open(lockPath, "wx");
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() })}\n`);
    return async () => {
      await handle.close();
      await unlink(lockPath).catch(() => {});
    };
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    if (!retried) {
      const details = await stat(lockPath).catch(() => null);
      const staleAfterMs = 50 * 60 * 1000;
      if (details && Date.now() - details.mtimeMs > staleAfterMs) {
        await unlink(lockPath).catch(() => {});
        return acquireRefreshLock(lockPath, true);
      }
    }
    return null;
  }
}

async function refreshCatalog() {
  if (remoteRefreshHosts.length) {
    await buildSnapshotOnRemoteHosts(remoteRefreshHosts);
  } else {
    await runNodeScript("scripts/build-catalog-snapshot.mjs", {
      POSOKANEI_SNAPSHOT_OUT: snapshotPath,
      POSOKANEI_META_OUT: metaPath,
      POSOKANEI_RUNTIME_OUT: runtimePath,
      POSOKANEI_BOOTSTRAP_OUT: bootstrapPath,
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

  try {
    await runNodeScript("scripts/generate-daily-bargain.mjs", {
      POSOKANEI_BARGAIN_CATALOG: snapshotPath,
      POSOKANEI_BARGAIN_OUT: dailyBargainPath,
    });
  } catch (error) {
    console.error(`Daily bargain generation failed; keeping the previous pick: ${error.message}`);
  }

  await writeRefreshStatus({
    status: "ok",
    checked_at: new Date().toISOString(),
    generated_at: snapshot.generated_at,
    product_count: productCount,
  });

  if (uploadEnabled) {
    for (const target of ftpTargets) {
      try {
        await publishRefreshToTarget(target, snapshot.generated_at);
      } catch (error) {
        if (target.required) throw error;
        console.error(`Optional catalogue mirror ${target.name} failed: ${describeRefreshError(error)}`);
      }
    }
  } else {
    console.log("Upload skipped because --no-upload was passed.");
  }
}

async function buildSnapshotOnRemoteHosts(hosts) {
  let lastError;

  for (const host of hosts) {
    try {
      console.log(`Building catalogue snapshot on ${host}...`);
      await buildSnapshotOnRemoteHost(host);
      console.log(`Catalogue snapshot built on ${host}.`);
      return;
    } catch (error) {
      lastError = error;
      console.error(`Refresh runner ${host} failed: ${describeRefreshError(error)}`);
    }
  }

  throw lastError || new Error("All refresh runners failed.");
}

async function buildSnapshotOnRemoteHost(host) {
  const remoteDir = `/tmp/posokanei-basket-refresh-${Date.now()}`;
  const remoteScriptsDir = `${remoteDir}/scripts`;
  const remoteSrcDir = `${remoteDir}/src`;
  const remoteScript = `${remoteScriptsDir}/build-catalog-snapshot.mjs`;
  const remoteRuntimeModule = `${remoteScriptsDir}/catalog-runtime.mjs`;
  const remoteBootstrapModule = `${remoteScriptsDir}/catalog-bootstrap.mjs`;
  const remoteDemoBasket = `${remoteSrcDir}/demoBasket.js`;
  const remoteSnapshot = `${remoteDir}/catalog.json`;
  const remoteMeta = `${remoteDir}/catalog-meta.json`;
  const remoteRuntime = `${remoteDir}/catalog-runtime.json`;
  const remoteBootstrap = `${remoteDir}/catalog-bootstrap.json`;
  const sshOptions = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15"];

  await mkdir(dirname(snapshotPath), { recursive: true });
  await mkdir(dirname(metaPath), { recursive: true });
  await mkdir(dirname(runtimePath), { recursive: true });
  await mkdir(dirname(bootstrapPath), { recursive: true });

  try {
    await run("ssh", [
      ...sshOptions,
      host,
      `rm -rf ${shellQuote(remoteDir)} && mkdir -p ${shellQuote(remoteScriptsDir)} ${shellQuote(remoteSrcDir)}`,
    ]);
    await run("scp", [
      ...sshOptions,
      resolve(projectRoot, "scripts/build-catalog-snapshot.mjs"),
      `${host}:${remoteScript}`,
    ]);
    await run("scp", [
      ...sshOptions,
      resolve(projectRoot, "scripts/catalog-runtime.mjs"),
      `${host}:${remoteRuntimeModule}`,
    ]);
    await run("scp", [
      ...sshOptions,
      resolve(projectRoot, "scripts/catalog-bootstrap.mjs"),
      `${host}:${remoteBootstrapModule}`,
    ]);
    await run("scp", [
      ...sshOptions,
      resolve(projectRoot, "src/demoBasket.js"),
      `${host}:${remoteDemoBasket}`,
    ]);
    await run("ssh", [
      ...sshOptions,
      host,
      [
        `POSOKANEI_SNAPSHOT_OUT=${shellQuote(remoteSnapshot)}`,
        `POSOKANEI_META_OUT=${shellQuote(remoteMeta)}`,
        `POSOKANEI_RUNTIME_OUT=${shellQuote(remoteRuntime)}`,
        `POSOKANEI_BOOTSTRAP_OUT=${shellQuote(remoteBootstrap)}`,
        `node ${shellQuote(remoteScript)}`,
      ].join(" "),
    ]);
    await run("scp", [...sshOptions, `${host}:${remoteSnapshot}`, snapshotPath]);
    await run("scp", [...sshOptions, `${host}:${remoteMeta}`, metaPath]);
    await run("scp", [...sshOptions, `${host}:${remoteRuntime}`, runtimePath]);
    await run("scp", [...sshOptions, `${host}:${remoteBootstrap}`, bootstrapPath]);
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
    const password = await readTargetPassword(primaryTarget);
    await publishDataFile(refreshStatusPath, "refresh-status.json", primaryTarget, password);
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
  if (/Connection timed out during banner exchange|UNKNOWN port 65535|ssh exited with 255/i.test(message)) {
    return "Refresh runner SSH connection timed out.";
  }
  if (/UND_ERR_CONNECT_TIMEOUT|Connect Timeout Error/i.test(message)) {
    return "Refresh runner could not connect to the upstream API.";
  }
  if (/fetch failed/i.test(message)) {
    return "Refresh runner fetch failed.";
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

function parseRefreshHosts(value) {
  return String(value || "")
    .split(/[,\s]+/)
    .map((host) => host.trim())
    .filter(Boolean);
}

async function runNodeScript(script, extraEnv = {}) {
  await run(process.execPath, [resolve(projectRoot, script)], {
    cwd: projectRoot,
    env: { ...process.env, ...extraEnv },
  });
}

async function readTargetPassword(target) {
  const directPassword = target.password || "";
  if (directPassword) return directPassword;
  if (!target.keychainService) {
    throw new Error("FTP_PASS or FTP_KEYCHAIN_SERVICE must be set in the environment or .env.local.");
  }
  const { stdout } = await run("/usr/bin/security", [
    "find-generic-password",
    "-s",
    target.keychainService,
    "-a",
    target.user,
    "-w",
  ], { quiet: true });
  const password = stdout.trim();
  if (!password) {
    throw new Error("The FTP password was not found in Keychain and FTP_PASS was not set.");
  }
  return password;
}

async function publishRefreshToTarget(target, expectedGeneratedAt) {
  const password = await readTargetPassword(target);
  await publishDataFile(snapshotPath, "catalog.json", target, password);
  await publishDataFile(metaPath, "catalog-meta.json", target, password);
  await publishDataFile(runtimePath, "catalog-runtime.json", target, password);
  await publishDataFile(bootstrapPath, "catalog-bootstrap.json", target, password);
  if (existsSync(dailyBargainPath)) {
    await publishDataFile(dailyBargainPath, "daily-bargain.json", target, password);
  }
  // Publish status last so it only announces a refresh after every data file is live.
  await publishDataFile(refreshStatusPath, "refresh-status.json", target, password);
  await verifyPublicRefreshFiles(expectedGeneratedAt, target);
}

async function publishDataFile(filePath, remoteName, target, password) {
  const remoteRoot = target.remoteDir === "." ? "" : `${target.remoteDir}/`;
  await uploadFileAtomic({
    filePath,
    url: `ftp://${target.host}/${remoteRoot}data/${remoteName}`,
    user: target.user,
    password,
    cwd: projectRoot,
  });
}

async function fetchPublicJson(url) {
  const response = await fetch(`${url}?v=${Date.now()}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    throw new Error(`${url} verification returned HTTP ${response.status}.`);
  }
  return response.json();
}

async function verifyPublicRefreshFiles(expectedGeneratedAt, target) {
  const targetCatalogUrl = target.publicCatalogUrl || publicDataUrl(target, "catalog.json");
  const targetMetaUrl = targetCatalogUrl.replace(/catalog\.json$/, "catalog-meta.json");
  const targetRuntimeUrl = targetCatalogUrl.replace(/catalog\.json$/, "catalog-runtime.json");
  const targetBootstrapUrl = targetCatalogUrl.replace(/catalog\.json$/, "catalog-bootstrap.json");
  const targetStatusUrl = targetCatalogUrl.replace(/catalog\.json$/, "refresh-status.json");
  const targetBargainUrl = targetCatalogUrl.replace(/catalog\.json$/, "daily-bargain.json");
  let observed = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const [
        publicSnapshot,
        publicMeta,
        publicRuntime,
        publicBootstrap,
        publicRefreshStatus,
      ] = await Promise.all([
        fetchPublicJson(targetCatalogUrl),
        fetchPublicJson(targetMetaUrl),
        fetchPublicJson(targetRuntimeUrl),
        fetchPublicJson(targetBootstrapUrl),
        fetchPublicJson(targetStatusUrl),
      ]);
      observed = {
        snapshot: publicSnapshot.generated_at || "",
        metadata: publicMeta.generated_at || "",
        runtime: publicRuntime.generated_at || "",
        bootstrap: publicBootstrap.generated_at || "",
        status: publicRefreshStatus.generated_at || "",
        statusValue: publicRefreshStatus.status || "",
      };
      const timestamps = [
        observed.snapshot,
        observed.metadata,
        observed.runtime,
        observed.bootstrap,
        observed.status,
      ];
      const publishedAt = Date.parse(observed.snapshot);
      const expectedAt = Date.parse(expectedGeneratedAt);
      if (
        timestamps.every((value) => value === observed.snapshot) &&
        observed.statusValue === "ok" &&
        Number.isFinite(publishedAt) &&
        publishedAt >= expectedAt
      ) {
        if (observed.snapshot !== expectedGeneratedAt) {
          console.log(`Accepted newer concurrent catalogue ${observed.snapshot}.`);
        }
        break;
      }
    } catch (error) {
      observed = { error: error.message };
    }

    if (attempt === 5) {
      throw new Error(
        `Public catalogue verification did not converge for ${expectedGeneratedAt}: ${JSON.stringify(observed)}.`,
      );
    }
    await sleep(5000);
  }

  console.log(`Verified public catalogue at ${targetCatalogUrl}`);
  console.log(`Verified public metadata at ${targetMetaUrl}`);
  console.log(`Verified compact runtime catalogue at ${targetRuntimeUrl}`);
  console.log(`Verified static startup catalogue at ${targetBootstrapUrl}`);
  console.log(`Verified public refresh status at ${targetStatusUrl}`);
  if (existsSync(dailyBargainPath)) {
    const localDailyBargain = JSON.parse(await readFile(dailyBargainPath, "utf8"));
    const publicDailyBargain = await fetchPublicJson(targetBargainUrl);
    if (publicDailyBargain.generated_at !== localDailyBargain.generated_at) {
      throw new Error("Public daily-bargain verification mismatch.");
    }
    console.log(`Verified public daily bargain at ${targetBargainUrl}`);
  }
}

function buildFtpTargets() {
  const primary = {
    name: "primary",
    required: true,
    host: requiredEnv("FTP_HOST"),
    remoteDir: trimSlashes(requiredEnv("FTP_REMOTE_DIR")) || ".",
    user: requiredEnv("FTP_USER"),
    password: process.env.FTP_PASS || "",
    keychainService: process.env.FTP_KEYCHAIN_SERVICE || "",
    publicCatalogUrl: process.env.POSOKANEI_PUBLIC_CATALOG_URL || "",
  };
  if (!process.env.FTP_MIRROR_HOST) return [primary];
  return [
    primary,
    {
      name: "legacy",
      required: false,
      host: requiredEnv("FTP_MIRROR_HOST"),
      remoteDir: trimSlashes(requiredEnv("FTP_MIRROR_REMOTE_DIR")) || ".",
      user: requiredEnv("FTP_MIRROR_USER"),
      password: process.env.FTP_MIRROR_PASS || "",
      keychainService: process.env.FTP_MIRROR_KEYCHAIN_SERVICE || "",
      publicCatalogUrl: process.env.POSOKANEI_MIRROR_PUBLIC_CATALOG_URL || "",
    },
  ];
}

function publicDataUrl(target, fileName) {
  if (target.publicCatalogUrl) {
    return target.publicCatalogUrl.replace(/catalog\.json$/, fileName);
  }
  const remoteRoot = target.remoteDir === "." ? "" : `${target.remoteDir}/`;
  return `https://${target.host}/${remoteRoot}data/${fileName}`;
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

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
