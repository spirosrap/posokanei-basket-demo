import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

export async function uploadFileAtomic({ filePath, url, user, password, cwd }) {
  const finalUrl = new URL(url);
  const temporaryUrl = new URL(finalUrl);
  temporaryUrl.pathname = `${finalUrl.pathname}.upload-${process.pid}-${Date.now()}-${randomUUID().slice(0, 8)}`;

  const curlConfig = [
    `user = "${escapeCurlConfig(`${user}:${password}`)}"`,
    "ftp-create-dirs",
    "silent",
    "show-error",
    "fail",
  ].join("\n");
  const input = `${curlConfig}\n`;

  await runCurl(["--config", "-", "-T", filePath, temporaryUrl.toString()], { cwd, input });

  try {
    await runCurl(
      [
        "--config",
        "-",
        "--quote",
        `RNFR ${decodeURIComponent(temporaryUrl.pathname)}`,
        "--quote",
        `RNTO ${decodeURIComponent(finalUrl.pathname)}`,
        `${finalUrl.protocol}//${finalUrl.host}/`,
      ],
      { cwd, input },
    );
  } catch (error) {
    await runCurl(
      [
        "--config",
        "-",
        "--quote",
        `DELE ${decodeURIComponent(temporaryUrl.pathname)}`,
        `${finalUrl.protocol}//${finalUrl.host}/`,
      ],
      { cwd, input, allowFailure: true },
    );
    throw error;
  }

  console.log(`Published ${filePath} atomically to ${redactFtpUrl(finalUrl)}`);
}

function runCurl(args, { cwd, input, allowFailure = false }) {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/curl", args, {
      cwd,
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
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || allowFailure) {
        resolve({ stdout, stderr, code });
        return;
      }
      reject(new Error(`/usr/bin/curl exited with ${code}: ${stderr || stdout}`));
    });
    child.stdin.end(input);
  });
}

function redactFtpUrl(url) {
  return `${url.protocol}//***@${url.host}${decodeURIComponent(url.pathname)}`;
}

function escapeCurlConfig(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
