#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TAURI_CONFIG="$PROJECT_ROOT/src-tauri/tauri.conf.json"

pass() {
  printf 'PASS  %s\n' "$1"
}

warn() {
  printf 'WARN  %s\n' "$1"
}

fail() {
  printf 'FAIL  %s\n' "$1"
}

check_cmd() {
  local cmd="$1"
  local label="$2"
  if command -v "$cmd" >/dev/null 2>&1; then
    pass "$label"
  else
    fail "$label"
  fi
}

echo "RelayDesk macOS release doctor"
echo "Project root: $PROJECT_ROOT"
echo

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "This doctor is intended for macOS hosts."
  exit 1
fi

pass "Running on macOS"
check_cmd xcrun "xcrun available"
check_cmd hdiutil "hdiutil available"
check_cmd security "security CLI available"

echo
echo "[Code signing]"
IDENTITIES="$(security find-identity -v -p codesigning 2>/dev/null || true)"
if [[ -n "$IDENTITIES" && "$IDENTITIES" != *"0 valid identities found"* ]]; then
  pass "At least one code-signing identity is installed"
  printf '%s\n' "$IDENTITIES"
else
  warn "No code-signing identity found in keychain"
fi

if [[ -n "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  pass "APPLE_SIGNING_IDENTITY is set"
else
  warn "APPLE_SIGNING_IDENTITY is not set"
fi

if [[ -n "${APPLE_CERTIFICATE:-}" ]]; then
  pass "APPLE_CERTIFICATE is set for CI-style signing"
else
  warn "APPLE_CERTIFICATE is not set"
fi

echo
echo "[Notarization]"
if [[ -n "${APPLE_API_ISSUER:-}" && -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_KEY_PATH:-}" ]]; then
  pass "App Store Connect API notarization env is complete"
elif [[ -n "${APPLE_ID:-}" && -n "${APPLE_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
  pass "Apple ID notarization env is complete"
else
  warn "No complete notarization credential set detected"
fi

echo
echo "[Updater]"
warn "Base tauri.conf keeps createUpdaterArtifacts disabled by design; use npm run build:desktop:updater for updater builds"

if [[ -n "${RELAYDESK_GITHUB_REPO:-}" || -n "${RELAYDESK_UPDATER_ENDPOINT:-}" ]]; then
  pass "Updater endpoint env is set"
else
  warn "Neither RELAYDESK_GITHUB_REPO nor RELAYDESK_UPDATER_ENDPOINT is set"
fi

if [[ -n "${RELAYDESK_UPDATER_PUBLIC_KEY:-}" || -n "${RELAYDESK_UPDATER_PUBLIC_KEY_PATH:-}" ]]; then
  pass "Updater public key source is set"
else
  warn "Updater public key source is missing"
fi

if [[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  pass "TAURI_SIGNING_PRIVATE_KEY is set"
else
  warn "TAURI_SIGNING_PRIVATE_KEY is not set"
fi

if [[ -n "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" ]]; then
  pass "TAURI_SIGNING_PRIVATE_KEY_PASSWORD is set"
else
  warn "TAURI_SIGNING_PRIVATE_KEY_PASSWORD is not set (optional if key has no password)"
fi

echo
echo "[Build outputs]"
if [[ -d "$PROJECT_ROOT/src-tauri/target/release/bundle/macos/RelayDesk.app" ]]; then
  pass "RelayDesk.app bundle exists"
else
  warn "RelayDesk.app bundle is not present yet"
fi

if [[ -f "$PROJECT_ROOT/src-tauri/target/release/bundle/dmg/RelayDesk_0.1.0_aarch64.dmg" ]]; then
  pass "DMG bundle exists"
else
  warn "DMG bundle is not present yet"
fi

echo
echo "Doctor completed."
