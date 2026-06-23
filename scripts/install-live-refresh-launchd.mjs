#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const label = "com.agenticspiros.posokanei-basket-refresh";
const intervalSeconds = Number(process.env.POSOKANEI_REFRESH_INTERVAL_SECONDS || 3600);
const launchAgentsDir = resolve(homedir(), "Library/LaunchAgents");
const logsDir = resolve(homedir(), "Library/Logs");
const plistPath = resolve(launchAgentsDir, `${label}.plist`);
const stdoutPath = resolve(logsDir, "posokanei-basket-refresh.log");
const stderrPath = resolve(logsDir, "posokanei-basket-refresh.err.log");
const uid = String(process.getuid?.() || "");

const command = [
  `cd ${shellQuote(projectRoot)}`,
  "export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
  "npm run live:refresh",
].join(" && ");

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>${escapeXml(command)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>${intervalSeconds}</integer>
  <key>StandardOutPath</key>
  <string>${escapeXml(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(stderrPath)}</string>
  <key>WorkingDirectory</key>
  <string>${escapeXml(projectRoot)}</string>
</dict>
</plist>
`;

await mkdir(launchAgentsDir, { recursive: true });
await mkdir(logsDir, { recursive: true });
await writeFile(plistPath, plist, "utf8");

runLaunchctl(["bootout", `gui/${uid}`, plistPath], { allowFailure: true });
runLaunchctl(["bootstrap", `gui/${uid}`, plistPath]);
runLaunchctl(["enable", `gui/${uid}/${label}`], { allowFailure: true });
runLaunchctl(["kickstart", "-k", `gui/${uid}/${label}`]);

console.log(`Installed ${label}`);
console.log(`Refresh interval: ${intervalSeconds} seconds`);
console.log(`Plist: ${plistPath}`);
console.log(`Logs: ${stdoutPath}`);

function runLaunchctl(args, options = {}) {
  const result = spawnSync("/bin/launchctl", args, { encoding: "utf8" });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`launchctl ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
