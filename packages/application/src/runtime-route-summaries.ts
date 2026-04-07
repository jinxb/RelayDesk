import {
  buildScopedSessionOwnerId,
  parseScopedSessionOwnerId,
  type FileConfig,
  type Platform,
} from "../../state/src/index.js";
import { knownChannels } from "./workspace.js";

export interface RuntimeRouteSummary {
  readonly channel: Platform;
  readonly enabled: boolean;
  readonly aiCommand: string;
  readonly defaultWorkDir: string;
  readonly activeChatId?: string;
  readonly activeUserId?: string;
  readonly activeWorkDir?: string;
  readonly activeSessionId?: string;
  readonly continuityMode?: "fresh" | "relay" | "native";
  readonly hasActiveOverride: boolean;
}

interface SessionRecord {
  readonly workDir?: string;
  readonly updatedAt?: number;
  readonly activeConvId?: string;
  readonly sessionIds?: Partial<Record<string, string>>;
  readonly history?: Array<{ role?: string; content?: string; createdAt?: number }>;
}

interface ActiveRouteAnchor {
  readonly chatId: string;
  readonly userId?: string;
}

function routeAnchor(
  activeChats: Record<string, unknown>,
  channel: Platform,
): ActiveRouteAnchor | undefined {
  const value = activeChats[channel];
  if (!value) {
    return undefined;
  }
  if (typeof value === "string") {
    return {
      chatId: value,
    };
  }
  if (typeof value === "object") {
    const anchor = value as { chatId?: unknown; userId?: unknown };
    if (typeof anchor.chatId === "string") {
      return {
        chatId: anchor.chatId,
        userId: typeof anchor.userId === "string" ? anchor.userId : undefined,
      };
    }
  }
  return undefined;
}

function defaultWorkDirForAgent(
  workspace: FileConfig,
  aiCommand: string,
): string {
  if (aiCommand === "claude") {
    return workspace.tools?.claude?.workDir?.trim() ?? "";
  }
  if (aiCommand === "codex") {
    return workspace.tools?.codex?.workDir?.trim() ?? "";
  }
  return "";
}

function activeSessionRecord(input: {
  readonly channel: Platform;
  readonly active: ActiveRouteAnchor | undefined;
  readonly sessions: Record<string, unknown>;
}): SessionRecord | undefined {
  if (!input.active) {
    return undefined;
  }

  if (input.active.userId) {
    const exactKey = buildScopedSessionOwnerId({
      platform: input.channel,
      chatId: input.active.chatId,
      userId: input.active.userId,
    });
    const exact = input.sessions[exactKey] as SessionRecord | undefined;
    if (exact?.workDir) {
      return exact;
    }
  }

  const scopedMatches = Object.entries(input.sessions)
    .map(([key, value]) => ({ parsed: parseScopedSessionOwnerId(key), record: value as SessionRecord }))
    .filter((entry) => {
      if (!entry.parsed || !entry.record?.workDir) {
        return false;
      }
      if (entry.parsed.platform !== input.channel || entry.parsed.chatId !== input.active?.chatId) {
        return false;
      }
      if (!input.active?.userId) {
        return true;
      }
      return entry.parsed.userId === input.active.userId;
    })
    .sort((left, right) => (right.record.updatedAt ?? 0) - (left.record.updatedAt ?? 0));

  if (scopedMatches.length > 0) {
    return scopedMatches[0]?.record;
  }

  if (!input.active.userId) {
    return undefined;
  }

  const legacy = input.sessions[input.active.userId] as SessionRecord | undefined;
  return legacy?.workDir ? legacy : undefined;
}

export function buildRuntimeRouteSummaries(input: {
  readonly workspace: FileConfig;
  readonly sessions: Record<string, unknown>;
  readonly activeChats: Record<string, unknown>;
}): RuntimeRouteSummary[] {
  return knownChannels.map((channel) => {
    const platform = input.workspace.platforms?.[channel];
    const aiCommand =
      (platform?.aiCommand as string | undefined)
      ?? (input.workspace.aiCommand as string | undefined)
      ?? "claude";
    const defaultWorkDir = defaultWorkDirForAgent(input.workspace, aiCommand);
    const active = routeAnchor(input.activeChats, channel);
    const activeWorkDir = activeSessionRecord({
      channel,
      active,
      sessions: input.sessions,
    });
    const activeSessionId = activeWorkDir?.sessionIds?.[aiCommand];
    const continuityMode = activeSessionId
      ? "native"
      : (activeWorkDir?.history?.length ?? 0) > 0
        ? "relay"
        : "fresh";

    return {
      channel,
      enabled: Boolean(platform?.enabled),
      aiCommand,
      defaultWorkDir,
      activeChatId: active?.chatId,
      activeUserId: active?.userId,
      activeWorkDir: activeWorkDir?.workDir,
      activeSessionId,
      continuityMode,
      hasActiveOverride: Boolean(
        activeWorkDir?.workDir &&
        defaultWorkDir &&
        activeWorkDir.workDir !== defaultWorkDir,
      ),
    };
  });
}
