import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const sourceDir = resolve(appRoot, "node_modules");
const targetDir = resolve(appRoot, "src-tauri", "node_modules");

if (!existsSync(sourceDir)) {
  throw new Error(`Missing node_modules at ${sourceDir}. Run npm install first.`);
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(dirname(targetDir), { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });

process.stdout.write(`[relaydesk] staged node_modules at ${targetDir}\n`);
