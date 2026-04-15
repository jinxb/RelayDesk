import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { dirname, join, resolve, win32 } from "node:path";
import { APP_HOME } from "../constants.js";
import type { Platform } from "../config.js";
import { createLogger } from "../logger.js";
import { buildScopedSessionOwnerId, parseScopedSessionOwnerId } from "./scope-id.js";

const log = createLogger("Session");
const SESSIONS_FILE = join(APP_HOME, "data", "sessions.json");
const MAX_HISTORY_TURNS = 6;
const MAX_TURN_CHARS = 4000;

export type ToolId = "claude" | "codex" | "codebuddy";

type ToolSessionIds = Partial<Record<ToolId, string>>;
type ResetReason =
  | "user_new"
  | "workdir_changed"
  | "startup"
  | "session_invalid"
  | "task_error";

interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

interface ThreadState {
  sessionIds?: ToolSessionIds;
  totalTurns?: number;
  claudeModel?: string;
  workDir?: string;
  updatedAt?: number;
  history?: ConversationTurn[];
  lastResetReason?: ResetReason;
}

interface UserSession {
  sessionIds?: ToolSessionIds;
  workDir: string;
  activeConvId?: string;
  totalTurns?: number;
  claudeModel?: string;
  threads?: Record<string, ThreadState>;
  history?: ConversationTurn[];
  updatedAt?: number;
  lastResetReason?: ResetReason;
  lastResetAt?: number;
  platform?: string;
  chatId?: string;
  scopeUserId?: string;
  threadId?: string;
}

interface ConversationStatus {
  readonly convId?: string;
  readonly sessionId?: string;
  readonly workDir: string;
  readonly historyTurns: number;
  readonly continuityMode: "fresh" | "relay" | "native";
  readonly lastResetReason?: ResetReason;
  readonly lastResetAt?: number;
}

interface SessionLookup {
  readonly key: string;
  readonly session: UserSession;
}

function nextConvId(): string {
  return randomBytes(4).toString("hex");
}

function trimStoredContent(content: string): string {
  const normalized = content.trim();
  if (normalized.length <= MAX_TURN_CHARS) {
    return normalized;
  }

  const head = normalized.slice(0, 2000);
  const tail = normalized.slice(-1200);
  const omitted = normalized.length - head.length - tail.length;
  return `${head}\n\n...(已截断 ${omitted} 字符)...\n\n${tail}`;
}

function cloneSession(session: UserSession): UserSession {
  return {
    ...session,
    sessionIds: { ...(session.sessionIds ?? {}) },
    history: [...(session.history ?? [])],
    threads: session.threads
      ? Object.fromEntries(
          Object.entries(session.threads).map(([key, value]) => [
            key,
            {
              ...value,
              sessionIds: { ...(value.sessionIds ?? {}) },
            },
          ]),
        )
      : undefined,
  };
}

export function resolveWorkDirInput(baseDir: string, targetDir: string): string {
  const drivePathMatch = targetDir.match(/^([a-zA-Z]):(.*)$/);
  if (drivePathMatch) {
    const [, drive, rest] = drivePathMatch;
    if (rest === "") return `${drive}:\\`;
    if (rest.startsWith("/") || rest.startsWith("\\")) return win32.normalize(`${drive}:${rest}`);
    return win32.resolve(`${drive}:\\`, rest);
  }

  if (targetDir === "~" || targetDir.startsWith("~/")) {
    const home = process.env.USERPROFILE || process.env.HOME || "";
    return join(home, targetDir.slice(1));
  }

  if (targetDir.startsWith("/") || (targetDir.length >= 3 && targetDir[1] === ":" && (targetDir[2] === "\\" || targetDir[2] === "/"))) {
    return targetDir;
  }

  return resolve(baseDir, targetDir);
}

export class SessionManager {
  private sessions = new Map<string, UserSession>();
  private convSessionMap = new Map<string, string>();
  private defaultWorkDir: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(defaultWorkDir: string, previousDefaultWorkDir?: string) {
    this.defaultWorkDir = defaultWorkDir;
    this.load(previousDefaultWorkDir);
  }

  getSessionIdForConv(userId: string, convId: string, toolId: ToolId): string | undefined {
    const session = this.findSession(userId);
    if (session?.activeConvId === convId) return session.sessionIds?.[toolId];
    return this.convSessionMap.get(this.getConvSessionKey(userId, convId, toolId));
  }

  setSessionIdForConv(userId: string, convId: string, toolId: ToolId, sessionId: string): void {
    const session = this.ensureSession(userId);
    if (session.activeConvId === convId) {
      if (!session.sessionIds) session.sessionIds = {};
      session.sessionIds[toolId] = sessionId;
      this.touch(session);
      this.save();
      return;
    }

    this.convSessionMap.set(this.getConvSessionKey(userId, convId, toolId), sessionId);
  }

  clearSessionForConv(userId: string, convId: string, toolId: ToolId, reason: ResetReason = "task_error"): void {
    const session = this.findSession(userId);
    if (session?.activeConvId === convId) {
      this.clearToolSession(session, toolId, reason);
    }
    this.convSessionMap.delete(this.getConvSessionKey(userId, convId, toolId));
    log.info(`Cleared ${toolId} session for scope ${userId}, convId=${convId}, reason=${reason}`);
  }

  getSessionIdForThread(_userId: string, _threadId: string, _toolId: ToolId): string | undefined {
    return undefined;
  }

  setSessionIdForThread(userId: string, _threadId: string, toolId: ToolId, sessionId: string): void {
    const convId = this.getConvId(userId);
    this.setSessionIdForConv(userId, convId, toolId, sessionId);
  }

  getWorkDir(userId: string): string {
    return this.findSession(userId)?.workDir ?? this.defaultWorkDir;
  }

  getWorkDirForRoute(platform: Platform, chatId: string, userId?: string): string | undefined {
    const exact = userId
      ? this.findSession(buildScopedSessionOwnerId({ platform, chatId, userId }))
      : undefined;
    if (exact?.workDir) {
      return exact.workDir;
    }

    const scopedMatches = [...this.sessions.entries()]
      .map(([key, session]) => ({ key, session }))
      .filter((entry): entry is SessionLookup => {
        const parsed = parseScopedSessionOwnerId(entry.key);
        if (!parsed || parsed.platform !== platform || parsed.chatId !== chatId) {
          return false;
        }
        return userId ? parsed.userId === userId : true;
      })
      .sort((left, right) => (right.session.updatedAt ?? 0) - (left.session.updatedAt ?? 0));

    if (scopedMatches.length > 0) {
      return scopedMatches[0]?.session.workDir;
    }

    if (!userId) {
      return undefined;
    }

    return this.sessions.get(userId)?.workDir;
  }

  hasUserSession(userId: string): boolean {
    return this.findSession(userId) !== undefined;
  }

  peekConvId(userId: string): string | undefined {
    return this.findSession(userId)?.activeConvId;
  }

  getConvId(userId: string): string {
    const session = this.ensureSession(userId);
    if (!session.activeConvId) {
      session.activeConvId = nextConvId();
      this.touch(session);
      this.save();
    }
    return session.activeConvId;
  }

  async setWorkDir(userId: string, workDir: string): Promise<string> {
    const currentDir = this.getWorkDir(userId);
    const realPath = await this.resolveAndValidate(currentDir, workDir);
    const session = this.ensureSession(userId);
    const oldConvId = session.activeConvId;
    session.workDir = realPath;
    this.resetConversation(session, "workdir_changed");
    if (oldConvId) {
      this.clearConvSessionMappings(userId, oldConvId);
    }
    this.flushSync();
    log.info(`WorkDir changed for scope ${userId}: ${realPath}, previousConvId=${oldConvId ?? "none"}`);
    return realPath;
  }

  clearAllCliSessionIds(): void {
    let changed = false;
    for (const session of this.sessions.values()) {
      for (const toolId of ["codex", "codebuddy"] as const) {
        if (session.sessionIds?.[toolId] !== undefined) {
          this.clearToolSession(session, toolId, "startup");
          changed = true;
        }
      }
      if (session.threads) {
        for (const thread of Object.values(session.threads)) {
          for (const toolId of ["codex", "codebuddy"] as const) {
            if (thread.sessionIds?.[toolId] !== undefined) {
              delete thread.sessionIds[toolId];
              changed = true;
            }
          }
        }
      }
    }
    for (const key of [...this.convSessionMap.keys()]) {
      if (key.endsWith(":codex") || key.endsWith(":codebuddy")) {
        this.convSessionMap.delete(key);
        changed = true;
      }
    }
    if (changed) {
      this.flushSync();
      log.info("Cleared CLI session IDs for codex/codebuddy on startup");
    }
  }

  newSession(userId: string): boolean {
    const session = this.findSession(userId);
    if (!session) return false;

    const oldConvId = session.activeConvId;
    this.resetConversation(session, "user_new");
    if (oldConvId) {
      this.clearConvSessionMappings(userId, oldConvId);
    }
    this.flushSync();
    log.info(`New session for scope ${userId}: oldConvId=${oldConvId ?? "none"}, newConvId=${session.activeConvId}`);
    return true;
  }

  clearActiveToolSession(userId: string, toolId: ToolId, reason: ResetReason = "task_error"): boolean {
    const session = this.findSession(userId);
    if (!session) return false;

    const hadSession = session.sessionIds?.[toolId] !== undefined;
    this.clearToolSession(session, toolId, reason);
    if (session.activeConvId) {
      this.convSessionMap.delete(this.getConvSessionKey(userId, session.activeConvId, toolId));
    }
    this.flushSync();
    log.info(`Cleared active ${toolId} session for scope ${userId}, convId=${session.activeConvId ?? "none"}, reason=${reason}`);
    return hadSession;
  }

  addTurns(userId: string, turns: number): number {
    const session = turns === 0 ? this.findSession(userId) : this.ensureSession(userId);
    if (!session) return 0;
    session.totalTurns = (session.totalTurns ?? 0) + turns;
    this.touch(session);
    this.save();
    return session.totalTurns;
  }

  addTurnsForThread(userId: string, _threadId: string, turns: number): number {
    return this.addTurns(userId, turns);
  }

  getModel(userId: string, _threadId?: string): string | undefined {
    return this.findSession(userId)?.claudeModel;
  }

  setModel(userId: string, model: string | undefined, _threadId?: string): void {
    const session = this.ensureSession(userId);
    session.claudeModel = model;
    this.touch(session);
    this.save();
  }

  recordUserPrompt(userId: string, prompt: string): void {
    this.appendHistory(userId, "user", prompt);
    this.addTurns(userId, 1);
  }

  recordAssistantReply(userId: string, reply: string): void {
    this.appendHistory(userId, "assistant", reply);
  }

  getRecentTurns(userId: string): ConversationTurn[] {
    return [...(this.findSession(userId)?.history ?? [])];
  }

  getConversationStatus(userId: string, toolId: ToolId): ConversationStatus {
    const session = this.findSession(userId);
    const sessionId = session?.sessionIds?.[toolId];
    const historyTurns = session?.history?.length ?? 0;
    return {
      convId: session?.activeConvId,
      sessionId,
      workDir: session?.workDir ?? this.defaultWorkDir,
      historyTurns,
      continuityMode: sessionId ? "native" : historyTurns > 0 ? "relay" : "fresh",
      lastResetReason: session?.lastResetReason,
      lastResetAt: session?.lastResetAt,
    };
  }

  destroy(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.doFlush();
  }

  private appendHistory(userId: string, role: ConversationTurn["role"], content: string): void {
    const normalized = trimStoredContent(content);
    if (!normalized) return;

    const session = this.ensureSession(userId);
    const nextTurn = {
      role,
      content: normalized,
      createdAt: Date.now(),
    };
    session.history = [...(session.history ?? []), nextTurn].slice(-MAX_HISTORY_TURNS);
    this.touch(session);
    this.save();
  }

  private clearToolSession(session: UserSession, toolId: ToolId, reason: ResetReason): void {
    if (session.sessionIds) {
      delete session.sessionIds[toolId];
    }
    session.lastResetReason = reason;
    session.lastResetAt = Date.now();
    this.touch(session);
  }

  private ensureSession(userId: string): UserSession {
    const existing = this.sessions.get(userId);
    if (existing) {
      this.applyScopeMetadata(userId, existing);
      return existing;
    }

    const migrated = this.migrateLegacySession(userId);
    if (migrated) {
      this.save();
      return migrated;
    }

    const session: UserSession = {
      workDir: this.defaultWorkDir,
      activeConvId: nextConvId(),
      sessionIds: {},
      updatedAt: Date.now(),
    };
    this.applyScopeMetadata(userId, session);
    this.sessions.set(userId, session);
    this.save();
    return session;
  }

  private findSession(userId: string): UserSession | undefined {
    const existing = this.sessions.get(userId);
    if (existing) return existing;

    const parsed = parseScopedSessionOwnerId(userId);
    if (!parsed) return this.sessions.get(userId);
    return this.sessions.get(parsed.userId);
  }

  private migrateLegacySession(userId: string): UserSession | undefined {
    const parsed = parseScopedSessionOwnerId(userId);
    if (!parsed) return undefined;

    const legacy = this.sessions.get(parsed.userId);
    if (!legacy) return undefined;

    const migrated = cloneSession(legacy);
    this.applyScopeMetadata(userId, migrated);
    this.sessions.set(userId, migrated);
    return migrated;
  }

  private applyScopeMetadata(userId: string, session: UserSession): void {
    const parsed = parseScopedSessionOwnerId(userId);
    if (!parsed) return;
    session.platform = parsed.platform;
    session.chatId = parsed.chatId;
    session.scopeUserId = parsed.userId;
    session.threadId = parsed.threadId;
  }

  private resetConversation(session: UserSession, reason: ResetReason): void {
    this.archiveActiveConversation(session, reason);
    session.sessionIds = {};
    session.activeConvId = nextConvId();
    session.totalTurns = 0;
    session.history = [];
    session.lastResetReason = reason;
    session.lastResetAt = Date.now();
    this.touch(session);
  }

  private touch(session: UserSession): void {
    session.updatedAt = Date.now();
  }

  private archiveActiveConversation(session: UserSession, reason: ResetReason): void {
    const activeConvId = session.activeConvId;
    const archivedAt = Date.now();
    const hasSnapshot =
      Boolean(activeConvId) &&
      (
        (session.history?.length ?? 0) > 0 ||
        Object.keys(session.sessionIds ?? {}).length > 0 ||
        (session.totalTurns ?? 0) > 0
      );

    if (!activeConvId || !hasSnapshot) {
      return;
    }

    session.threads ??= {};
    session.threads[activeConvId] = {
      sessionIds: { ...(session.sessionIds ?? {}) },
      totalTurns: session.totalTurns,
      claudeModel: session.claudeModel,
      workDir: session.workDir,
      updatedAt: archivedAt,
      history: [...(session.history ?? [])],
      lastResetReason: reason,
    };
  }

  private async resolveAndValidate(baseDir: string, targetDir: string): Promise<string> {
    const resolved = resolveWorkDirInput(baseDir, targetDir);
    if (!existsSync(resolved)) throw new Error(`目录不存在: \`${resolved}\``);
    return realpath(resolved);
  }

  private load(previousDefaultWorkDir?: string): void {
    try {
      if (!existsSync(SESSIONS_FILE)) return;
      const data = JSON.parse(readFileSync(SESSIONS_FILE, "utf-8")) as Record<string, UserSession>;
      for (const [key, value] of Object.entries(data)) {
        if (!value || typeof value.workDir !== "string") continue;
        const session = cloneSession(value);
        if (previousDefaultWorkDir && session.workDir === previousDefaultWorkDir) {
          session.workDir = this.defaultWorkDir;
        }
        if (!session.activeConvId) session.activeConvId = nextConvId();
        if (!session.sessionIds) session.sessionIds = {};
        if (!session.history) session.history = [];
        if (!session.updatedAt) session.updatedAt = 0;
        this.applyScopeMetadata(key, session);
        this.sessions.set(key, session);
      }
    } catch {
      /* ignore */
    }
  }

  private save(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.doFlush();
    }, 500);
  }

  private flushSync(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.doFlush();
  }

  private doFlush(): void {
    try {
      const dir = dirname(SESSIONS_FILE);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const data: Record<string, UserSession> = {};
      for (const [key, value] of this.sessions) {
        data[key] = value;
      }
      writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      log.error("Failed to save sessions:", err);
    }
  }

  private getConvSessionKey(userId: string, convId: string, toolId: ToolId): string {
    return `${userId}:${convId}:${toolId}`;
  }

  private clearConvSessionMappings(userId: string, convId: string): void {
    for (const toolId of ["claude", "codex", "codebuddy"] as const) {
      this.convSessionMap.delete(this.getConvSessionKey(userId, convId, toolId));
    }
  }
}
