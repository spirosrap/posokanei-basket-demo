import { spawn } from "node:child_process";
import { captureCommandFailure } from "./refresh-runner-failures.mjs";

export function runRefreshCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
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
    child.on("error", (error) => {
      if (options.allowFailure) resolve({ stdout, stderr });
      else reject(captureCommandFailure(error, { command, stdout, stderr }));
    });
    child.on("close", (code, signal) => {
      if (code === 0 || options.allowFailure) {
        resolve({ stdout, stderr });
        return;
      }
      reject(captureCommandFailure(
        new Error(`${command} exited with ${code}${signal ? ` (${signal})` : ""}: ${stderr || stdout}`),
        { command, code, signal, stdout, stderr },
      ));
    });
    child.stdin.end(options.input || undefined);
  });
}
