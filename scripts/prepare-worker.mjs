import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const sourceDir = resolve(appRoot, "packages", "runtime", "dist");
const targetDir = resolve(appRoot, "src-tauri", "runtime");

if (!existsSync(sourceDir)) {
  throw new Error(`Missing worker dist at ${sourceDir}. Run the worker build first.`);
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(dirname(targetDir), { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });

process.stdout.write(`[relaydesk] staged worker bundle at ${targetDir}\n`);
