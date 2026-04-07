import type { ChannelKey } from "../../lib/models";
import { channelDefinitions } from "../catalog";
import type { RelayDeskStudio } from "../types";
import { resolvePreferredWorkdir } from "../workspace";

interface ScopedSessionIdentity {
  readonly platform: ChannelKey;
  readonly chatId: string;
  readonly userId: string;
}

interface SessionTurnRecord {
  readonly role?: "user" | "assistant";
  readonly content?: string;
  readonly createdAt?: number;
}

interface SessionRecord {
  readonly workDir?: string;
  readonly activeConvId?: string;
  readonly totalTurns?: number;
  readonly updatedAt?: number;
  readonly lastResetReason?: string;
  readonly sessionIds?: Partial<Record<string, string>>;
  readonly history?: readonly SessionTurnRecord[];
}

export interface SessionManagementTurn {
  readonly key: string;
  readonly role: "user" | "assistant";
  readonly roleLabel: string;
  readonly content: string;
  readonly timeLabel: string;
}

export interface SessionManagementEntry {
  readonly key: string;
  readonly platformLabel: string;
  readonly agentValue: string;
  readonly sessionId: string;
  readonly sessionIdLabel: string;
  readonly updatedAtLabel: string;
  readonly updatedAtFullLabel: string;
  readonly isPrimary: boolean;
  readonly workDir: string;
  readonly continuityLabel: string;
  readonly activeConvId: string;
  readonly lastResetReasonLabel: string;
  readonly chatId: string;
  readonly userId: string;
  readonly turnCount: number;
  readonly turns: readonly SessionManagementTurn[];
}

const SESSION_SCOPE_PREFIX = "scope";

function parseScopedSessionOwnerId(value: string): ScopedSessionIdentity | null {
  const parts = value.split(":");
  if (parts.length !== 5 || parts[0] !== SESSION_SCOPE_PREFIX) {
    return null;
  }

  const platform = parts[1] as ChannelKey;
  const chatId = decodeURIComponent(parts[2] ?? "");
  const userId = decodeURIComponent(parts[3] ?? "");
  if (!platform || !chatId || !userId) {
    return null;
  }

  return { platform, chatId, userId };
}

function channelLabel(channelKey: ChannelKey) {
  return channelDefinitions.find((item) => item.key === channelKey)?.title ?? channelKey;
}

function effectiveAgent(studio: RelayDeskStudio, channelKey: ChannelKey) {
  return studio.snapshot.workspace.platforms?.[channelKey]?.aiCommand
    || studio.snapshot.workspace.aiCommand
    || "claude";
}

function routeForChannel(studio: RelayDeskStudio, channelKey: ChannelKey) {
  return (studio.snapshot.bootstrap?.routes ?? []).find((route) => route.channel === channelKey);
}

function defaultWorkdir(studio: RelayDeskStudio) {
  return resolvePreferredWorkdir(studio.snapshot.workspace) || "未设置";
}

function resolveSessionId(record: SessionRecord, preferredAgent: string) {
  const direct = record.sessionIds?.[preferredAgent];
  if (direct) {
    return direct;
  }

  return Object.values(record.sessionIds ?? {}).find(Boolean) ?? "未建立";
}

function continuityLabel(record: SessionRecord, sessionId: string) {
  if (sessionId !== "未建立") {
    return "原生续接";
  }

  if ((record.history?.length ?? 0) > 0) {
    return "RelayDesk 续接";
  }

  return "全新上下文";
}

function formatRelativeTime(updatedAt: number | undefined) {
  if (!updatedAt) return "未知时间";
  const deltaMs = Date.now() - updatedAt;
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  if (deltaMs < minuteMs) return "刚刚";
  if (deltaMs < hourMs) return `${Math.max(1, Math.floor(deltaMs / minuteMs))} 分钟前`;
  if (deltaMs < dayMs) return `${Math.max(1, Math.floor(deltaMs / hourMs))} 小时前`;
  return `${Math.max(1, Math.floor(deltaMs / dayMs))} 天前`;
}

function formatAbsoluteTime(updatedAt: number | undefined) {
  if (!updatedAt) return "未知";

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(updatedAt);
}

function formatTurnTime(createdAt: number | undefined) {
  if (!createdAt) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(createdAt);
}

function formatResetReason(reason: string | undefined) {
  if (!reason) return "无";
  if (reason === "user_new") return "用户新开会话";
  if (reason === "workdir_changed") return "工作目录变更";
  if (reason === "startup") return "服务启动";
  if (reason === "session_invalid") return "会话失效";
  if (reason === "task_error") return "任务异常";
  return reason;
}

function buildTurns(record: SessionRecord) {
  return (record.history ?? []).map((turn, index) => ({
    key: `${turn.createdAt ?? index}-${index}`,
    role: turn.role === "assistant" ? "assistant" : "user",
    roleLabel: turn.role === "assistant" ? "assistant" : "user",
    content: turn.content?.trim() || "(空内容)",
    timeLabel: formatTurnTime(turn.createdAt),
  }));
}

function buildSessionIdLabel(sessionId: string) {
  if (sessionId === "未建立" || sessionId.length <= 20) {
    return sessionId;
  }

  return `${sessionId.slice(0, 8)}...${sessionId.slice(-6)}`;
}

function buildSessionEntry(studio: RelayDeskStudio, key: string, raw: unknown): SessionManagementEntry | null {
  const identity = parseScopedSessionOwnerId(key);
  if (!identity) {
    return null;
  }

  const record = raw as SessionRecord;
  const preferredAgent = effectiveAgent(studio, identity.platform);
  const route = routeForChannel(studio, identity.platform);
  const resolvedSessionId = resolveSessionId(record, preferredAgent);
  const isPrimary = route?.activeChatId === identity.chatId
    && (!route?.activeUserId || route.activeUserId === identity.userId);
  const sessionId = isPrimary
    ? ((route?.activeSessionId ?? resolvedSessionId) || "未建立")
    : resolvedSessionId;

  return {
    key,
    platformLabel: channelLabel(identity.platform),
    agentValue: preferredAgent,
    sessionId,
    sessionIdLabel: buildSessionIdLabel(sessionId),
    updatedAtLabel: formatRelativeTime(record.updatedAt),
    updatedAtFullLabel: formatAbsoluteTime(record.updatedAt),
    isPrimary,
    workDir: record.workDir || route?.activeWorkDir || defaultWorkdir(studio),
    continuityLabel: continuityLabel(record, sessionId),
    activeConvId: record.activeConvId || "未建立",
    lastResetReasonLabel: formatResetReason(record.lastResetReason),
    chatId: identity.chatId,
    userId: identity.userId,
    turnCount: record.totalTurns ?? record.history?.length ?? 0,
    turns: buildTurns(record),
  };
}

export function buildSessionManagementEntries(studio: RelayDeskStudio) {
  const sessions = studio.snapshot.bootstrap?.sessions.sessions ?? {};

  return Object.entries(sessions)
    .map(([key, raw]) => buildSessionEntry(studio, key, raw))
    .filter((item): item is SessionManagementEntry => Boolean(item))
    .sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) {
        return left.isPrimary ? -1 : 1;
      }

      const leftSource = sessions[left.key] as SessionRecord | undefined;
      const rightSource = sessions[right.key] as SessionRecord | undefined;
      return (rightSource?.updatedAt ?? 0) - (leftSource?.updatedAt ?? 0);
    });
}
