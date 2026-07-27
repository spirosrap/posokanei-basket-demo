import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const DEFAULT_UPLOAD_ATTEMPTS = 4;

export async function uploadFileAtomic({
  filePath,
  url,
  user,
  password,
  cwd,
  attempts = DEFAULT_UPLOAD_ATTEMPTS,
  retryBaseDelayMs = 1500,
  curlRunner = runCurl,
  wait = sleep,
  logger = console,
}) {
  const finalUrl = new URL(url);
  const curlConfig = [
    `user = "${escapeCurlConfig(`${user}:${password}`)}"`,
    "ftp-create-dirs",
    "silent",
    "show-error",
    "fail",
  ].join("\n");
  const input = `${curlConfig}\n`;
  const maximumAttempts = Math.max(1, Number(attempts) || DEFAULT_UPLOAD_ATTEMPTS);
  let lastError;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const temporaryUrl = new URL(finalUrl);
    temporaryUrl.pathname = `${finalUrl.pathname}.upload-${process.pid}-${Date.now()}-${randomUUID().slice(0, 8)}`;

    try {
      await uploadAtomicAttempt({
        filePath,
        finalUrl,
        temporaryUrl,
        cwd,
        input,
        curlRunner,
      });
      if (attempt > 1) {
        logger.log(`FTP publication recovered on attempt ${attempt} for ${redactFtpUrl(finalUrl)}`);
      }
      logger.log(`Published ${filePath} atomically to ${redactFtpUrl(finalUrl)}`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt >= maximumAttempts || !isRetryableFtpUploadError(error)) throw error;

      const delayMs = Math.min(retryBaseDelayMs * (2 ** (attempt - 1)), 8000);
      logger.warn(
        `Temporary FTP failure for ${redactFtpUrl(finalUrl)} `
        + `(attempt ${attempt}/${maximumAttempts}); retrying in ${delayMs} ms.`,
      );
      await wait(delayMs);
    }
  }

  throw lastError;
}

async function uploadAtomicAttempt({
  filePath,
  finalUrl,
  temporaryUrl,
  cwd,
  input,
  curlRunner,
}) {
  try {
    await curlRunner(["--config", "-", "-T", filePath, temporaryUrl.toString()], { cwd, input });

    await curlRunner(
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
    await curlRunner(
      [
        "--config",
        "-",
        "--quote",
        `DELE ${decodeURIComponent(temporaryUrl.pathname)}`,
        `${finalUrl.protocol}//${finalUrl.host}/`,
      ],
      { cwd, input, allowFailure: true },
    ).catch(() => {});
    throw error;
  }
}

export function isRetryableFtpUploadError(error) {
  const message = String(error?.message || error || "");
  const exitCode = Number(message.match(/curl exited with (\d+)/i)?.[1]);
  if ([5, 6, 7, 18, 28, 35, 52, 55, 56].includes(exitCode)) return true;
  return /FTP response timeout|operation timed out|connection (?:reset|refused)|temporary failure/i.test(
    message,
  );
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
