import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { APP_HOME } from "../../../state/src/index.js";

const FEISHU_DEDUPE_FILE = join(APP_HOME, "data", "feishu-dedupe.json");
const MESSAGE_DEDUPE_TTL_MS = 60_000;
const MAX_DEDUPE_ENTRIES = 500;
const SAVE_DEBOUNCE_MS = 200;

type FeishuDedupeSnapshot = Record<string, number>;

const processedMessages = new Map<string, number>();
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function pruneExpiredMessages(now: number): void {
  for (const [messageId, timestamp] of processedMessages) {
    if (now - timestamp > MESSAGE_DEDUPE_TTL_MS) {
      processedMessages.delete(messageId);
    }
  }
}

function parseSnapshot(input: unknown): FeishuDedupeSnapshot {
  if (!input || typeof input !== "object") {
    return {};
  }

  const snapshot: FeishuDedupeSnapshot = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      snapshot[key] = value;
    }
  }
  return snapshot;
}

function ensureLoaded(): void {
  if (loaded) {
    return;
  }
  loaded = true;
  processedMessages.clear();
  try {
    if (!existsSync(FEISHU_DEDUPE_FILE)) {
      return;
    }
    const raw = JSON.parse(readFileSync(FEISHU_DEDUPE_FILE, "utf-8")) as unknown;
    const snapshot = parseSnapshot(raw);
    for (const [messageId, timestamp] of Object.entries(snapshot)) {
      processedMessages.set(messageId, timestamp);
    }
    pruneExpiredMessages(Date.now());
  } catch {
    processedMessages.clear();
  }
}

function writeSnapshot(): void {
  const dir = dirname(FEISHU_DEDUPE_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const snapshot = Object.fromEntries(processedMessages) as FeishuDedupeSnapshot;
  writeFileSync(FEISHU_DEDUPE_FILE, JSON.stringify(snapshot, null, 2), "utf-8");
}

function scheduleSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writeSnapshot();
  }, SAVE_DEBOUNCE_MS);
}

export function isDuplicateFeishuMessage(messageId: string): boolean {
  if (!messageId) {
    return false;
  }

  ensureLoaded();
  const now = Date.now();
  pruneExpiredMessages(now);
  if (processedMessages.has(messageId)) {
    return true;
  }

  processedMessages.set(messageId, now);
  if (processedMessages.size > MAX_DEDUPE_ENTRIES) {
    pruneExpiredMessages(now);
  }
  scheduleSave();
  return false;
}

export function flushFeishuMessageDedupe(): void {
  ensureLoaded();
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  writeSnapshot();
}
