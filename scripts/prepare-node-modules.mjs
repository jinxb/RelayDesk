import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const sourceDir = resolve(appRoot, "node_modules");
const targetDir = resolve(appRoot, "src-tauri", "node_modules");

const RUNTIME_ENTRY_DEPENDENCIES = [
  "@anthropic-ai/claude-agent-sdk",
  "@larksuiteoapi/node-sdk",
  "dingtalk-stream",
  "telegraf",
  "ws",
];

function packageDir(rootDir, packageName) {
  return resolve(rootDir, ...packageName.split("/"));
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function readInstalledPackageJson(rootDir, packageName) {
  const filePath = join(packageDir(rootDir, packageName), "package.json");
  if (!existsSync(filePath)) {
    throw new Error(`Missing installed package metadata for ${packageName} at ${filePath}`);
  }
  return readJson(filePath);
}

function collectRuntimePackages(rootDir, entryPackages) {
  const queue = [...entryPackages];
  const seen = new Set();

  while (queue.length > 0) {
    const packageName = queue.shift();
    if (!packageName || seen.has(packageName)) {
      continue;
    }

    const packageJson = readInstalledPackageJson(rootDir, packageName);
    seen.add(packageName);

    const dependencyNames = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.peerDependencies ?? {}).filter((name) =>
        existsSync(packageDir(rootDir, name)),
      ),
    ];

    for (const dependencyName of dependencyNames) {
      if (!seen.has(dependencyName)) {
        queue.push(dependencyName);
      }
    }
  }

  return Array.from(seen).sort();
}

function copyRuntimePackages(rootDir, outDir, packageNames) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  for (const packageName of packageNames) {
    const sourcePath = packageDir(rootDir, packageName);
    const targetPath = packageDir(outDir, packageName);
    mkdirSync(dirname(targetPath), { recursive: true });
    cpSync(sourcePath, targetPath, { recursive: true });
  }
}

function removeIfExists(targetPath) {
  rmSync(targetPath, { recursive: true, force: true });
}

function pruneAnthropicSdk(outDir) {
  const sdkDir = packageDir(outDir, "@anthropic-ai/claude-agent-sdk");
  if (!existsSync(sdkDir)) {
    return;
  }

  for (const relativePath of [
    "browser-sdk.js",
    "browser-sdk.d.ts",
    "embed.js",
    "embed.d.ts",
    "bridge.mjs",
    "bridge.d.ts",
    "extractFromBunfs.js",
    "extractFromBunfs.d.ts",
    "agentSdkTypes.d.ts",
    "sdk-tools.d.ts",
    "sdk.d.ts",
    "README.md",
    "bun.lock",
    "manifest.zst.json",
  ]) {
    removeIfExists(join(sdkDir, relativePath));
  }

  const vendorDir = join(sdkDir, "vendor");
  const audioDir = join(vendorDir, "audio-capture");
  const ripgrepDir = join(vendorDir, "ripgrep");
  const audioKeepDir = process.platform === "darwin"
    ? process.arch === "arm64" ? "arm64-darwin" : "x64-darwin"
    : process.platform === "win32"
      ? process.arch === "arm64" ? "arm64-win32" : "x64-win32"
      : process.arch === "arm64" ? "arm64-linux" : "x64-linux";
  const ripgrepKeepDir = process.platform === "darwin"
    ? process.arch === "arm64" ? "arm64-darwin" : "x64-darwin"
    : process.platform === "win32"
      ? process.arch === "arm64" ? "arm64-win32" : "x64-win32"
      : process.arch === "arm64" ? "arm64-linux" : "x64-linux";

  if (existsSync(audioDir)) {
    for (const entry of ["arm64-darwin", "x64-darwin", "arm64-win32", "x64-win32", "x64-linux", "arm64-linux"]) {
      if (entry !== audioKeepDir) {
        removeIfExists(join(audioDir, entry));
      }
    }
  }

  if (existsSync(ripgrepDir)) {
    for (const entry of ["arm64-darwin", "x64-darwin", "arm64-win32", "x64-win32", "x64-linux", "arm64-linux"]) {
      if (entry !== ripgrepKeepDir) {
        removeIfExists(join(ripgrepDir, entry));
      }
    }
  }
}

function pruneFeishuSdk(outDir) {
  const sdkDir = packageDir(outDir, "@larksuiteoapi/node-sdk");
  if (!existsSync(sdkDir)) {
    return;
  }

  removeIfExists(join(sdkDir, "es"));
  removeIfExists(join(sdkDir, "types"));
  removeIfExists(join(sdkDir, "README.md"));
  removeIfExists(join(sdkDir, "README.zh.md"));
}

function pruneTypeOnlyPackages(outDir) {
  removeIfExists(join(outDir, "@types"));
  removeIfExists(join(outDir, "undici-types"));
}

function pruneRuntimePackages(outDir) {
  pruneAnthropicSdk(outDir);
  pruneFeishuSdk(outDir);
  pruneTypeOnlyPackages(outDir);
}

if (!existsSync(sourceDir)) {
  throw new Error(`Missing node_modules at ${sourceDir}. Run npm install first.`);
}

const runtimePackages = collectRuntimePackages(sourceDir, RUNTIME_ENTRY_DEPENDENCIES);
copyRuntimePackages(sourceDir, targetDir, runtimePackages);
pruneRuntimePackages(targetDir);

process.stdout.write(
  `[relaydesk] staged ${runtimePackages.length} runtime packages at ${targetDir}\n`,
);
