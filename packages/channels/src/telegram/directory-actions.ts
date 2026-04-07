import { randomBytes } from "node:crypto";

const TELEGRAM_DIRECTORY_ACTION_PREFIX = "cdt:";
const DIRECTORY_ACTION_TTL_MS = 10 * 60 * 1000;

interface TelegramDirectoryActionEntry {
  readonly userId: string;
  readonly path: string;
  readonly expiresAt: number;
}

const directoryActions = new Map<string, TelegramDirectoryActionEntry>();

function cleanupExpiredDirectoryActions(now = Date.now()) {
  for (const [token, entry] of directoryActions) {
    if (entry.expiresAt <= now) {
      directoryActions.delete(token);
    }
  }
}

export function createTelegramDirectoryCallbackData(
  userId: string,
  path: string,
): string {
  cleanupExpiredDirectoryActions();
  const token = randomBytes(8).toString("hex");
  directoryActions.set(token, {
    userId,
    path,
    expiresAt: Date.now() + DIRECTORY_ACTION_TTL_MS,
  });
  return `${TELEGRAM_DIRECTORY_ACTION_PREFIX}${token}`;
}

export function resolveTelegramDirectoryCallbackData(
  data: string,
): { userId: string; path: string } | null {
  if (!data.startsWith(TELEGRAM_DIRECTORY_ACTION_PREFIX)) {
    return null;
  }

  cleanupExpiredDirectoryActions();
  const token = data.slice(TELEGRAM_DIRECTORY_ACTION_PREFIX.length);
  const entry = directoryActions.get(token);
  if (!entry) {
    return null;
  }

  return {
    userId: entry.userId,
    path: entry.path,
  };
}
