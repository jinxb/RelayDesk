import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const tauriConfigPath = join(repoRoot, "src-tauri", "tauri.conf.json");
const bundleRoot = join(repoRoot, "src-tauri", "target", "release", "bundle");

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function normalizeReleaseTag(version) {
  return process.env.RELAYDESK_RELEASE_TAG?.trim() || `v${version}`;
}

function buildAssetUrl(repo, tag, fileName) {
  return `https://github.com/${repo}/releases/download/${tag}/${fileName}`;
}

function hostArch() {
  if (process.arch === "arm64") {
    return "aarch64";
  }
  if (process.arch === "x64") {
    return "x86_64";
  }
  return process.arch;
}

function inferMacArchFromDmg() {
  const dmgDir = join(bundleRoot, "dmg");
  if (!existsSync(dmgDir)) {
    return null;
  }

  const match = readdirSync(dmgDir).find((fileName) => fileName.endsWith(".dmg"));
  if (!match) {
    return null;
  }
  if (match.includes("_aarch64")) {
    return "aarch64";
  }
  if (match.includes("_x64") || match.includes("_x86_64")) {
    return "x86_64";
  }
  return null;
}

function detectTargets(fileNames) {
  const entries = [];
  for (const fileName of fileNames) {
    if (fileName.endsWith(".app.tar.gz")) {
      const arch =
        fileName.includes("_aarch64.")
          ? "aarch64"
          : fileName.includes("_x64.") || fileName.includes("_x86_64.")
            ? "x86_64"
            : inferMacArchFromDmg() ?? hostArch();
      entries.push({ fileName, target: `darwin-${arch}`, installer: "app" });
      continue;
    }
    if (fileName.endsWith(".AppImage.tar.gz")) {
      const arch = fileName.includes("_aarch64.") ? "aarch64" : "x86_64";
      entries.push({ fileName, target: `linux-${arch}`, installer: "appimage" });
      continue;
    }
    if (fileName.endsWith(".msi.zip")) {
      const arch = fileName.includes("_aarch64.") ? "aarch64" : "x86_64";
      entries.push({ fileName, target: `windows-${arch}`, installer: "msi" });
      continue;
    }
    if (fileName.endsWith(".exe.zip")) {
      const arch = fileName.includes("_aarch64.") ? "aarch64" : "x86_64";
      entries.push({ fileName, target: `windows-${arch}`, installer: "nsis" });
    }
  }
  return entries;
}

function buildPlatforms(repo, tag) {
  const platforms = {};
  for (const dir of ["macos", "linux", "msi", "nsis"]) {
    const dirPath = join(bundleRoot, dir);
    if (!existsSync(dirPath)) continue;
    const fileNames = readdirSync(dirPath);
    for (const entry of detectTargets(fileNames)) {
      const sigPath = join(dirPath, `${entry.fileName}.sig`);
      if (!existsSync(sigPath)) {
        continue;
      }
      const signature = readFileSync(sigPath, "utf-8").trim();
      platforms[`${entry.target}-${entry.installer}`] = {
        url: buildAssetUrl(repo, tag, entry.fileName),
        signature,
      };
      if (!platforms[entry.target]) {
        platforms[entry.target] = {
          url: buildAssetUrl(repo, tag, entry.fileName),
          signature,
        };
      }
    }
  }
  return platforms;
}

const tauriConfig = readJson(tauriConfigPath);
const version = tauriConfig.version;
const repo = requireEnv("RELAYDESK_GITHUB_REPO");
const tag = normalizeReleaseTag(version);
const outputPath = process.env.RELAYDESK_UPDATER_MANIFEST_PATH?.trim()
  || join(bundleRoot, "latest.json");
const notes = process.env.RELAYDESK_RELEASE_NOTES?.trim()
  || "See GitHub Release notes for full details.";
const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: buildPlatforms(repo, tag),
};

if (Object.keys(manifest.platforms).length === 0) {
  throw new Error(
    "No updater artifacts with matching .sig files were found. Run the updater build first.",
  );
}

writeFileSync(outputPath, JSON.stringify(manifest, null, 2), "utf-8");
console.log(`Wrote updater manifest to ${outputPath}`);
