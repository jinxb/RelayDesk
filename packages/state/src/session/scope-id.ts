import type { Platform } from "../config.js";

export interface ScopedSessionIdentity {
  readonly platform: Platform;
  readonly chatId: string;
  readonly userId: string;
  readonly threadId?: string;
}

const EMPTY_THREAD_ID = "-";
const SESSION_SCOPE_PREFIX = "scope";

function normalizePart(value: string | undefined): string {
  return encodeURIComponent((value ?? "").trim());
}

export function buildScopedSessionOwnerId(identity: ScopedSessionIdentity): string {
  const threadId = identity.threadId?.trim() || EMPTY_THREAD_ID;
  return [
    SESSION_SCOPE_PREFIX,
    identity.platform,
    normalizePart(identity.chatId),
    normalizePart(identity.userId),
    normalizePart(threadId),
  ].join(":");
}

export function parseScopedSessionOwnerId(value: string): ScopedSessionIdentity | null {
  const parts = value.split(":");
  if (parts.length !== 5 || parts[0] !== SESSION_SCOPE_PREFIX) {
    return null;
  }

  const platform = parts[1] as Platform;
  const chatId = decodeURIComponent(parts[2] ?? "");
  const userId = decodeURIComponent(parts[3] ?? "");
  const threadId = decodeURIComponent(parts[4] ?? "");
  if (!platform || !chatId || !userId) {
    return null;
  }

  return {
    platform,
    chatId,
    userId,
    threadId: threadId === EMPTY_THREAD_ID ? undefined : threadId,
  };
}
