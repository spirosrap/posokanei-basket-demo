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

const ftpHost = requiredEnv("FTP_HOST");
const ftpRemoteDir = trimSlashes(requiredEnv("FTP_REMOTE_DIR"));
const ftpUser = requiredEnv("FTP_USER");
const password = process.env.FTP_PASS || (await readKeychainPassword());
const includeData = process.env.DEPLOY_INCLUDE_DATA === "1";
const buildFiles = await listFiles(distRoot);
const files = buildFiles.filter((filePath) => {
  const buildPath = relative(distRoot, filePath).split("\\").join("/");
  return includeData || !buildPath.startsWith("data/");
});

if (!includeData && files.length !== buildFiles.length) {
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

console.log(`Deployed ${files.length} files to https://${ftpHost}/${ftpRemoteDir}/`);

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

async function readKeychainPassword() {
  const keychainService = process.env.FTP_KEYCHAIN_SERVICE || "";
  if (!keychainService) {
    throw new Error("FTP_PASS or FTP_KEYCHAIN_SERVICE must be set locally.");
  }
  const result = await run("/usr/bin/security", [
    "find-generic-password",
    "-s",
    keychainService,
    "-a",
    ftpUser,
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
