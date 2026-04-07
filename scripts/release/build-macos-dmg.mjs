import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const tauriConfigPath = join(repoRoot, "src-tauri", "tauri.conf.json");
const bundleRoot = join(repoRoot, "src-tauri", "target", "release", "bundle");

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function requireMacHost() {
  if (process.platform !== "darwin") {
    throw new Error("RelayDesk DMG packaging requires macOS host tooling.");
  }
}

function archSuffix() {
  if (process.arch === "arm64") {
    return "aarch64";
  }
  if (process.arch === "x64") {
    return "x64";
  }
  return process.arch;
}

function resolvePaths(productName, version) {
  return {
    appPath: join(bundleRoot, "macos", `${productName}.app`),
    outputDir: join(bundleRoot, "dmg"),
    outputPath: join(bundleRoot, "dmg", `${productName}_${version}_${archSuffix()}.dmg`),
  };
}

function stageAppBundle(tempDir, productName, appPath) {
  const stageDir = join(tempDir, `${productName}-dmg`);
  mkdirSync(stageDir, { recursive: true });
  cpSync(appPath, join(stageDir, `${productName}.app`), { recursive: true });
  symlinkSync("/Applications", join(stageDir, "Applications"));
  return stageDir;
}

export function buildMacOsDmg() {
  requireMacHost();

  const { productName, version } = readJson(tauriConfigPath);
  const { appPath, outputDir, outputPath } = resolvePaths(productName, version);
  if (!existsSync(appPath)) {
    throw new Error(`App bundle not found at ${appPath}. Run the app build first.`);
  }

  mkdirSync(outputDir, { recursive: true });
  rmSync(outputPath, { force: true });

  const tempDir = mkdtempSync(join(tmpdir(), "relaydesk-dmg-"));
  try {
    const stageDir = stageAppBundle(tempDir, productName, appPath);
    execFileSync(
      "hdiutil",
      [
        "create",
        "-volname",
        productName,
        "-srcfolder",
        stageDir,
        "-ov",
        "-format",
        "UDZO",
        "-fs",
        "HFS+",
        outputPath,
      ],
      { stdio: "inherit" },
    );
    return outputPath;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outputPath = buildMacOsDmg();
  console.log(`Created DMG at ${outputPath}`);
}
