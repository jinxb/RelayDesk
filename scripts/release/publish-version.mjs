import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const JSON_VERSION_FILES = [
  "package.json",
  "packages/agents/package.json",
  "packages/application/package.json",
  "packages/channels/package.json",
  "packages/desktop-api/package.json",
  "packages/interaction/package.json",
  "packages/runtime/package.json",
  "packages/state/package.json",
  "src-tauri/tauri.conf.json",
];

const CARGO_TOML_PATH = "src-tauri/Cargo.toml";
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const NPM_COMMAND = process.platform === "win32" ? "npm.cmd" : "npm";

function runGit(args, options = {}) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
    ...options,
  }).trim();
}

function runCommand(command, args) {
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    encoding: "utf-8",
  });
}

function requireVersionArgument() {
  const version = process.argv[2]?.trim();
  if (!version) {
    throw new Error("Usage: node scripts/release/publish-version.mjs <x.y.z>");
  }
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`Invalid version "${version}". Expected format: x.y.z`);
  }
  return version;
}

function ensureCleanWorkingTree() {
  const status = runGit(["status", "--short"]);
  if (status) {
    throw new Error(
      "Working tree is not clean. Commit or stash existing changes before publishing a version.",
    );
  }
}

function ensureTagDoesNotExist(tag) {
  const localTags = runGit(["tag", "--list", tag]);
  if (localTags) {
    throw new Error(`Tag ${tag} already exists locally.`);
  }
}

function ensureOriginRemoteExists() {
  const remote = runGit(["remote", "get-url", "origin"]);
  if (!remote) {
    throw new Error("Git remote 'origin' is not configured.");
  }
}

function ensureRemoteTagDoesNotExist(tag) {
  const remoteTag = runGit(["ls-remote", "--tags", "origin", `refs/tags/${tag}`]);
  if (remoteTag) {
    throw new Error(`Tag ${tag} already exists on origin.`);
  }
}

function currentBranch() {
  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch || branch === "HEAD") {
    throw new Error("Detached HEAD is not supported for publish-version.");
  }
  return branch;
}

function updateJsonVersion(relativePath, version) {
  const filePath = join(repoRoot, relativePath);
  const json = JSON.parse(readFileSync(filePath, "utf-8"));
  json.version = version;
  writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`, "utf-8");
}

function updateCargoTomlVersion(version) {
  const filePath = join(repoRoot, CARGO_TOML_PATH);
  const current = readFileSync(filePath, "utf-8");
  const next = current.replace(/^version = ".*"$/m, `version = "${version}"`);
  if (next === current) {
    throw new Error(`Unable to update version in ${CARGO_TOML_PATH}`);
  }
  writeFileSync(filePath, next, "utf-8");
}

function updateLockfileVersion(version) {
  const filePath = join(repoRoot, "package-lock.json");
  const lockfile = JSON.parse(readFileSync(filePath, "utf-8"));
  lockfile.version = version;
  if (lockfile.packages?.[""]) {
    lockfile.packages[""].version = version;
  }
  for (const relativePath of JSON_VERSION_FILES.slice(1, -1)) {
    if (lockfile.packages?.[relativePath]) {
      lockfile.packages[relativePath].version = version;
    }
  }
  writeFileSync(filePath, `${JSON.stringify(lockfile, null, 2)}\n`, "utf-8");
}

function updateVersions(version) {
  for (const relativePath of JSON_VERSION_FILES) {
    updateJsonVersion(relativePath, version);
  }
  updateCargoTomlVersion(version);
  updateLockfileVersion(version);
}

function runPreflightChecks() {
  runCommand(NPM_COMMAND, ["run", "test"]);
}

function commitTagAndPush(version, branch) {
  const tag = `v${version}`;
  runGit(["add", ...JSON_VERSION_FILES, CARGO_TOML_PATH, "package-lock.json"], {
    stdio: "inherit",
  });
  runGit(["commit", "-m", `chore: release v${version}`], { stdio: "inherit" });
  runGit(["tag", tag], { stdio: "inherit" });
  runGit(["push", "origin", branch], { stdio: "inherit" });
  runGit(["push", "origin", tag], { stdio: "inherit" });
}

function main() {
  const version = requireVersionArgument();
  const tag = `v${version}`;
  ensureCleanWorkingTree();
  ensureOriginRemoteExists();
  ensureTagDoesNotExist(tag);
  ensureRemoteTagDoesNotExist(tag);
  const branch = currentBranch();
  updateVersions(version);
  runPreflightChecks();
  commitTagAndPush(version, branch);
  process.stdout.write(`Published ${tag} from branch ${branch}\n`);
}

main();
