import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { APP_HOME } from "../../../state/src/index.js";

const WECHAT_DATA_DIR = join(APP_HOME, "data");
const WECHAT_SYNC_BUF_FILE = join(WECHAT_DATA_DIR, "wechat-sync-buf.json");
const WECHAT_CONTEXT_FILE = join(WECHAT_DATA_DIR, "wechat-context-tokens.json");

function ensureParentDir(path: string) {
  const parent = dirname(path);
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }
}

function readJsonFile(path: string): unknown {
  if (!existsSync(path)) {
    return undefined;
  }

  return JSON.parse(readFileSync(path, "utf-8")) as unknown;
}

export function loadWeChatSyncBuf(): string {
  try {
    const raw = readJsonFile(WECHAT_SYNC_BUF_FILE) as { syncBuf?: unknown } | undefined;
    return typeof raw?.syncBuf === "string" ? raw.syncBuf : "";
  } catch {
    return "";
  }
}

export function saveWeChatSyncBuf(syncBuf: string): void {
  ensureParentDir(WECHAT_SYNC_BUF_FILE);
  writeFileSync(
    WECHAT_SYNC_BUF_FILE,
    JSON.stringify({ syncBuf }, null, 2),
    "utf-8",
  );
}

export function loadWeChatContextTokens(): Map<string, string> {
  try {
    const raw = readJsonFile(WECHAT_CONTEXT_FILE) as Record<string, unknown> | undefined;
    if (!raw) {
      return new Map();
    }

    const tokens = new Map<string, string>();
    for (const [chatId, value] of Object.entries(raw)) {
      if (typeof value === "string" && value.trim().length > 0) {
        tokens.set(chatId, value);
      }
    }
    return tokens;
  } catch {
    return new Map();
  }
}

export function saveWeChatContextTokens(tokens: ReadonlyMap<string, string>): void {
  ensureParentDir(WECHAT_CONTEXT_FILE);
  writeFileSync(
    WECHAT_CONTEXT_FILE,
    JSON.stringify(Object.fromEntries(tokens), null, 2),
    "utf-8",
  );
}
