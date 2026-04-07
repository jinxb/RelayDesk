import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildMacOsDmg } from "./build-macos-dmg.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function readPublicKey() {
  if (process.env.RELAYDESK_UPDATER_PUBLIC_KEY?.trim()) {
    return process.env.RELAYDESK_UPDATER_PUBLIC_KEY.trim();
  }

  const keyPath = process.env.RELAYDESK_UPDATER_PUBLIC_KEY_PATH?.trim();
  if (keyPath) {
    return readFileSync(keyPath, "utf-8").trim();
  }

  throw new Error(
    "Updater public key is required. Set RELAYDESK_UPDATER_PUBLIC_KEY or RELAYDESK_UPDATER_PUBLIC_KEY_PATH.",
  );
}

function buildEndpoint() {
  const explicit = process.env.RELAYDESK_UPDATER_ENDPOINT?.trim();
  if (explicit) {
    return explicit;
  }

  const repo = process.env.RELAYDESK_GITHUB_REPO?.trim();
  if (!repo) {
    throw new Error(
      "GitHub Releases updater endpoint is missing. Set RELAYDESK_GITHUB_REPO or RELAYDESK_UPDATER_ENDPOINT.",
    );
  }

  return `https://github.com/${repo}/releases/latest/download/latest.json`;
}

function ensureSigningKey() {
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()) {
    throw new Error(
      "TAURI_SIGNING_PRIVATE_KEY must be set to generate updater artifacts.",
    );
  }
}

const updaterConfig = {
  bundle: {
    createUpdaterArtifacts: true,
  },
  plugins: {
    updater: {
      pubkey: readPublicKey(),
      endpoints: [buildEndpoint()],
    },
  },
};

ensureSigningKey();

const tempDir = mkdtempSync(join(tmpdir(), "relaydesk-updater-"));
const tempConfigPath = join(tempDir, "tauri.updater.config.json");
writeFileSync(tempConfigPath, JSON.stringify(updaterConfig, null, 2), "utf-8");

try {
  execFileSync(
    "npx",
    ["tauri", "build", "--bundles", "app", "-c", tempConfigPath],
    {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
    },
  );
  buildMacOsDmg();
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
