import { chmodSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const targetDir = resolve(appRoot, "src-tauri", "relaydesk-runtime");
const runtimePath = process.execPath;
const runtimeName = basename(runtimePath);
const targetPath = resolve(targetDir, runtimeName);

if (!existsSync(runtimePath)) {
  throw new Error(`Unable to locate the current Node runtime at ${runtimePath}`);
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(targetDir, { recursive: true });
cpSync(runtimePath, targetPath);
chmodSync(targetPath, 0o755);

process.stdout.write(`[relaydesk] staged runtime binary at ${targetPath}\n`);
