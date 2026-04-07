import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_HOME,
  PORT_FILE_NAME,
  SHUTDOWN_PORT,
  STARTUP_ERROR_FILE_NAME,
  WORKER_PID_FILE_NAME,
} from "./constants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PID_FILE = join(APP_HOME, WORKER_PID_FILE_NAME);
const PORT_FILE = join(APP_HOME, PORT_FILE_NAME);
const STARTUP_ERROR_FILE = join(APP_HOME, STARTUP_ERROR_FILE_NAME);
const require = createRequire(import.meta.url);

function removePortFile(): void {
  try {
    if (existsSync(PORT_FILE)) unlinkSync(PORT_FILE);
  } catch {
    /* ignore */
  }
}

function removeStartupErrorFile(): void {
  try {
    if (existsSync(STARTUP_ERROR_FILE)) unlinkSync(STARTUP_ERROR_FILE);
  } catch {
    /* ignore */
  }
}

function readStartupError(): string | null {
  try {
    if (!existsSync(STARTUP_ERROR_FILE)) {
      return null;
    }
    const message = readFileSync(STARTUP_ERROR_FILE, "utf-8").trim();
    return message || null;
  } catch {
    return null;
  }
}

function resolveTsxLoaderPath(): string {
  try {
    return require.resolve("tsx");
  } catch {
    throw new Error(
      "Unable to resolve the tsx loader required for TypeScript RelayDesk worker startup.",
    );
  }
}

function createTypeScriptEntry(entryPath: string) {
  return {
    command: process.execPath,
    args: ["--import", resolveTsxLoaderPath(), entryPath],
  };
}

function getServiceEntry(): { command: string; args: string[] } {
  const override = process.env.RELAYDESK_SERVICE_ENTRY?.trim();
  if (override) {
    return extname(override) === ".ts"
      ? createTypeScriptEntry(override)
      : {
          command: process.execPath,
          args: [override],
        };
  }

  const extension = extname(fileURLToPath(import.meta.url));
  if (extension === ".ts") {
    return createTypeScriptEntry(join(__dirname, "index.ts"));
  }

  return {
    command: process.execPath,
    args: [join(__dirname, "index.js")],
  };
}

export function getPid(): number | null {
  if (!existsSync(PID_FILE)) return null;
  try {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

export function writePid(pid: number): void {
  writeFileSync(PID_FILE, String(pid), "utf-8");
}

export function removePid(): void {
  try {
    if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
  } catch {
    /* ignore */
  }
}

export function isRunning(pid: number): boolean {
  try {
    if (process.platform === "win32") {
      const result = execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/NH"], {
        stdio: "pipe",
        windowsHide: true,
      }).toString();
      return result.includes(String(pid));
    }
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getServiceStatus(): {
  running: boolean;
  pid: number | null;
  phase: "stopped" | "starting" | "running";
  startupError: string | null;
} {
  const startupError = readStartupError();
  const pid = getPid();
  if (!pid) {
    return { running: false, pid: null, phase: "stopped", startupError };
  }
  if (!isRunning(pid)) {
    removePid();
    removePortFile();
    return { running: false, pid: null, phase: "stopped", startupError };
  }
  if (existsSync(PORT_FILE)) {
    if (startupError) {
      removeStartupErrorFile();
    }
    return { running: true, pid, phase: "running", startupError: null };
  }
  return { running: false, pid, phase: "starting", startupError };
}

export function startBackgroundService(cwd: string): { pid: number } {
  const current = getServiceStatus();
  if (current.phase !== "stopped" && current.pid) {
    return { pid: current.pid };
  }

  removePid();
  removePortFile();
  removeStartupErrorFile();
  const entry = getServiceEntry();
  const child = spawn(entry.command, entry.args, {
    detached: true,
    stdio: "ignore",
    cwd,
    env: process.env,
    windowsHide: process.platform === "win32",
  });
  child.unref();

  if (!child.pid) {
    throw new Error("Failed to start background service.");
  }

  writePid(child.pid);
  return { pid: child.pid };
}

export async function waitForBackgroundServiceReady(
  timeoutMs = 12000,
  pollIntervalMs = 100,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const startupError = readStartupError();
    if (startupError) {
      throw new Error(startupError);
    }

    const status = getServiceStatus();
    if (status.phase === "running" && status.pid) {
      removeStartupErrorFile();
      return;
    }

    if (status.phase === "stopped" || !status.pid) {
      const exitError = readStartupError();
      if (exitError) {
        throw new Error(exitError);
      }
      throw new Error("Background service exited before becoming ready.");
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  const timeoutError = readStartupError();
  if (timeoutError) {
    throw new Error(timeoutError);
  }
  throw new Error("Background service did not become ready in time.");
}

export async function stopBackgroundService(): Promise<{ pid: number | null; stopped: boolean }> {
  const pid = getPid();
  if (!pid) return { pid: null, stopped: false };
  if (!isRunning(pid)) {
    removePid();
    return { pid, stopped: true };
  }

  const port = existsSync(PORT_FILE)
    ? parseInt(readFileSync(PORT_FILE, "utf-8").trim(), 10) || SHUTDOWN_PORT
    : SHUTDOWN_PORT;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/shutdown`, {
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      for (let index = 0; index < 50; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (!isRunning(pid)) break;
      }
    }
  } catch {
    process.kill(pid, "SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (isRunning(pid)) {
    process.kill(pid, "SIGKILL");
  }

  removePid();
  removePortFile();
  removeStartupErrorFile();

  return { pid, stopped: true };
}
