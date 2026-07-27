import assert from "node:assert/strict";
import test from "node:test";
import {
  isRetryableFtpUploadError,
  uploadFileAtomic,
} from "../scripts/ftp-atomic-upload.mjs";

test("atomic FTP upload retries a transient timeout with a fresh temporary file", async () => {
  const calls = [];
  const waits = [];
  const messages = [];
  let uploadAttempts = 0;
  const curlRunner = async (args, options) => {
    calls.push({ args, options });
    if (args.includes("-T")) {
      uploadAttempts += 1;
      if (uploadAttempts === 1) {
        throw new Error("/usr/bin/curl exited with 28: FTP response timeout");
      }
    }
    return { code: 0, stdout: "", stderr: "" };
  };

  await uploadFileAtomic({
    filePath: "/tmp/catalog-runtime.json.gz",
    url: "ftp://example.com/data/catalog-runtime.json.gz",
    user: "user",
    password: "secret",
    cwd: "/tmp",
    attempts: 2,
    curlRunner,
    wait: async (delayMs) => waits.push(delayMs),
    logger: {
      log: (message) => messages.push(message),
      warn: (message) => messages.push(message),
    },
  });

  const uploadCalls = calls.filter(({ args }) => args.includes("-T"));
  assert.equal(uploadCalls.length, 2);
  assert.notEqual(uploadCalls[0].args.at(-1), uploadCalls[1].args.at(-1));
  assert.deepEqual(waits, [1500]);
  assert.ok(calls.some(({ args }) => args.some((arg) => arg.startsWith("DELE "))));
  assert.ok(messages.some((message) => message.includes("recovered on attempt 2")));
});

test("atomic FTP upload does not retry a local-file error", async () => {
  let uploadAttempts = 0;
  const curlRunner = async (args) => {
    if (args.includes("-T")) {
      uploadAttempts += 1;
      throw new Error("/usr/bin/curl exited with 26: Failed to open local file");
    }
    return { code: 0, stdout: "", stderr: "" };
  };

  await assert.rejects(
    uploadFileAtomic({
      filePath: "/tmp/missing.json",
      url: "ftp://example.com/data/missing.json",
      user: "user",
      password: "secret",
      cwd: "/tmp",
      attempts: 4,
      curlRunner,
      wait: async () => assert.fail("non-transient errors must not wait"),
      logger: { log: () => {}, warn: () => {} },
    }),
    /exited with 26/,
  );

  assert.equal(uploadAttempts, 1);
});

test("FTP retry classification covers network failures but not authentication or local files", () => {
  assert.equal(isRetryableFtpUploadError(new Error("curl exited with 28: timeout")), true);
  assert.equal(isRetryableFtpUploadError(new Error("curl exited with 56: reset")), true);
  assert.equal(isRetryableFtpUploadError(new Error("curl exited with 67: login denied")), false);
  assert.equal(isRetryableFtpUploadError(new Error("curl exited with 26: missing file")), false);
});
