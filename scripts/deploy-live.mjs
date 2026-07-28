#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { uploadFileAtomic } from "./ftp-atomic-upload.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(projectRoot, "dist");
loadLocalEnv(resolve(projectRoot, ".env.local"));

const deployTarget = process.argv.includes("--mirror") ? "mirror" : "primary";
const envPrefix = deployTarget === "mirror" ? "FTP_MIRROR" : "FTP";
const ftpHost = requiredEnv(`${envPrefix}_HOST`);
const ftpRemoteDir = trimSlashes(requiredEnv(`${envPrefix}_REMOTE_DIR`));
const ftpUser = requiredEnv(`${envPrefix}_USER`);
const password =
  process.env[`${envPrefix}_PASS`] ||
  (await readKeychainPassword(`${envPrefix}_KEYCHAIN_SERVICE`, ftpUser));
const includeData = process.env.DEPLOY_INCLUDE_DATA === "1";
const bootstrapOnly = process.argv.includes("--bootstrap-only");
const previewOnly = process.argv.includes("--preview-only");
const runtimeOnly = process.argv.includes("--runtime-only");
const configOnly = process.argv.includes("--config-only");
const apiOnly = process.argv.includes("--api-only");
const buildFiles = await listFiles(distRoot);
const files = configOnly ? buildFiles.filter((filePath) => {
  const buildPath = relative(distRoot, filePath).split("\\").join("/");
  return buildPath === ".htaccess";
}) : apiOnly ? buildFiles.filter((filePath) => {
  const buildPath = relative(distRoot, filePath).split("\\").join("/");
  return /^api\/[a-z0-9-]+\.php$/u.test(buildPath);
}) : previewOnly ? buildFiles.filter((filePath) => {
  const buildPath = relative(distRoot, filePath).split("\\").join("/");
  return /^data\/price-changes-preview\.json(?:\.(?:br|gz))?$/u.test(buildPath);
}) : runtimeOnly ? buildFiles.filter((filePath) => {
  const buildPath = relative(distRoot, filePath).split("\\").join("/");
  return /^data\/catalog-runtime\.json(?:\.(?:br|gz))?$/u.test(buildPath);
}) : bootstrapOnly ? buildFiles.filter((filePath) => {
  const buildPath = relative(distRoot, filePath).split("\\").join("/");
  return /^data\/catalog-bootstrap\.json(?:\.(?:br|gz))?$/u.test(buildPath);
}) : buildFiles.filter((filePath) => {
  const buildPath = relative(distRoot, filePath).split("\\").join("/");
  return includeData || !buildPath.startsWith("data/");
});

if (bootstrapOnly && files.length !== 3) {
  throw new Error(
    "dist/data/catalog-bootstrap.json plus its .br and .gz variants are required for --bootstrap-only.",
  );
}

if (previewOnly && files.length !== 3) {
  throw new Error(
    "dist/data/price-changes-preview.json plus its .br and .gz variants are required for --preview-only.",
  );
}

if (runtimeOnly && files.length !== 3) {
  throw new Error(
    "dist/data/catalog-runtime.json plus its .br and .gz variants are required for --runtime-only.",
  );
}

if (configOnly && files.length !== 1) {
  throw new Error("dist/.htaccess is required for --config-only.");
}

if (apiOnly && files.length === 0) {
  throw new Error("At least one dist/api/*.php endpoint is required for --api-only.");
}

if (!apiOnly && !bootstrapOnly && !includeData && files.length !== buildFiles.length) {
  console.log(
    `Preserving ${buildFiles.length - files.length} live data files. Use npm run live:refresh to update catalogue data.`,
  );
}

for (const filePath of files) {
  const remotePath = relative(distRoot, filePath).split("/").map(encodeURIComponent).join("/");
  await uploadFileAtomic({
    filePath,
    url: `ftp://${ftpHost}/${ftpRemoteDir}/${remotePath}`,
    user: ftpUser,
    password,
    cwd: projectRoot,
  });
}

console.log(
  `Deployed ${files.length} ${
    configOnly
      ? "server configuration file"
      : apiOnly
        ? "PHP API files"
      : bootstrapOnly
        ? "startup catalogue files"
        : previewOnly
          ? "price-change preview files"
          : runtimeOnly
            ? "runtime catalogue files"
          : "files"
  } to the ${deployTarget} target at https://${ftpHost}/${ftpRemoteDir}/`,
);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return nested.flat().sort();
}

async function readKeychainPassword(serviceVariable, account) {
  const keychainService = process.env[serviceVariable] || "";
  if (!keychainService) {
    throw new Error(`${envPrefix}_PASS or ${serviceVariable} must be set locally.`);
  }
  const result = await run("/usr/bin/security", [
    "find-generic-password",
    "-s",
    keychainService,
    "-a",
    account,
    "-w",
  ]);
  const value = result.trim();
  if (!value) throw new Error("FTP password was not found in Keychain.");
  return value;
}

function run(command, args, input = "") {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) resolveRun(stdout);
      else rejectRun(new Error(`${command} exited with ${code}: ${stderr || stdout}`));
    });
    child.stdin.end(input);
  });
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
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "").replace(/\\n/g, "\n");
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set in the environment or .env.local.`);
  return value;
}

function trimSlashes(value) {
  return String(value).replace(/^\/+|\/+$/g, "");
}
