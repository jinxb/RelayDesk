import type { BootstrapPayload, ChannelKey, ChannelProbeSnapshot } from "../../lib/models";
import { buildChannelState } from "../channel-probe-state";
import type { ChannelState } from "../channel-probe-state";
import { channelDefinitions } from "../catalog";
import { buildPriorityIssues } from "../readiness";
import { isRuntimeRunning, isRuntimeStarting, readRuntimeSnapshot } from "../runtime-state";
import type { RelayDeskStudio } from "../types";
import { resolvePreferredWorkdir } from "../workspace";
import { buildOverviewChannelSummary } from "./overview-copy";
type PriorityIssue = ReturnType<typeof buildPriorityIssues>[number];

export interface OverviewLead {
  readonly title: string;
  readonly detail: string;
  readonly tone: "idle" | "success" | "warning";
}

export interface OverviewAction {
  readonly label: string;
  readonly tone: "primary" | "soft";
  readonly run: () => Promise<unknown>;
}

export interface OverviewLog {
  readonly file: string;
  readonly lines: readonly {
    time: string;
    detail: string;
    tone: "neutral" | "success" | "warning";
  }[];
}

export interface OverviewWorkdirState {
  readonly defaultPath: string;
  readonly currentPath?: string;
  readonly overridden: boolean;
}

export interface OverviewChannel {
  readonly key: ChannelKey;
  readonly title: string;
  readonly agent: string;
  readonly active: boolean;
  readonly state: ChannelState;
  readonly summary: string;
  readonly workdir: OverviewWorkdirState;
}

export interface OverviewChannelStatus {
  readonly value: string;
  readonly tone: "idle" | "success" | "warning";
  readonly label: string;
}

export interface OverviewViewModel {
  readonly activeChannels: readonly OverviewChannel[];
  readonly channelStatus: OverviewChannelStatus;
  readonly issueCount: number;
  readonly lead: OverviewLead;
  readonly log: OverviewLog;
  readonly primaryAction: OverviewAction;
  readonly primaryIssue: PriorityIssue | undefined;
  readonly recentSessions: readonly OverviewRecentSession[];
  readonly running: boolean;
  readonly starting: boolean;
  readonly sessionSummary: OverviewSessionSummary;
  readonly summaryChannels: readonly OverviewChannel[];
  readonly workdir: OverviewWorkdirState;
}

export interface OverviewSessionSummary {
  readonly entryLabel: string;
  readonly entryValue: string;
  readonly agentValue: string;
  readonly continuityLabel: string;
  readonly sessionId: string;
  readonly workspaceLabel: string;
  readonly workspacePath: string;
  readonly scopeDetail: string;
}

export interface OverviewRecentSession {
  readonly key: string;
  readonly platformLabel: string;
  readonly agentValue: string;
  readonly continuityLabel: string;
  readonly sessionId: string;
  readonly updatedAtLabel: string;
  readonly isPrimary: boolean;
}

interface ScopedSessionIdentity {
  readonly platform: ChannelKey;
  readonly chatId: string;
  readonly userId: string;
}

interface OverviewSessionRecord {
  readonly updatedAt?: number;
  readonly sessionIds?: Partial<Record<string, string>>;
  readonly history?: Array<{ createdAt?: number }>;
}

const SESSION_SCOPE_PREFIX = "scope";
const RECENT_SESSION_LIMIT = 8;

function channelDefinition(channelKey: ChannelKey) {
  return channelDefinitions.find((item) => item.key === channelKey) ?? channelDefinitions[0];
}

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

function routeForChannel(studio: RelayDeskStudio, channelKey: ChannelKey) {
  return (studio.snapshot.bootstrap?.routes ?? []).find((route) => route.channel === channelKey);
}

function statePriority(state: ChannelState) {
  if (state.label === "需修复") return 0;
  if (state.label === "待补全") return 1;
  if (state.label === "需复核") return 2;
  if (state.label === "待检测") return 3;
  if (state.label === "已验证") return 4;
  return 5;
}

function preferredChannel(studio: RelayDeskStudio) {
  const activeEnabled = channelDefinitions.find((channel) => {
    if (!studio.snapshot.workspace.platforms?.[channel.key]?.enabled) {
      return false;
    }
    return Boolean(routeForChannel(studio, channel.key)?.activeChatId);
  });
  if (activeEnabled) {
    return activeEnabled;
  }

  const enabled = channelDefinitions.find((channel) => studio.snapshot.workspace.platforms?.[channel.key]?.enabled);
  if (enabled) {
    return enabled;
  }

  const healthy = channelDefinitions.find((channel) => studio.snapshot.bootstrap?.health[channel.key]?.healthy);
  return healthy ?? channelDefinitions[0];
}

function effectiveAgent(studio: RelayDeskStudio, channelKey: ChannelKey) {
  return studio.snapshot.workspace.platforms?.[channelKey]?.aiCommand
    || studio.snapshot.workspace.aiCommand
    || "claude";
}

function effectiveAgentForIdentity(
  studio: RelayDeskStudio,
  identity: ScopedSessionIdentity,
) {
  const matchedRoute = (studio.snapshot.bootstrap?.routes ?? []).find((route) => {
    return route.channel === identity.platform
      && route.activeChatId === identity.chatId
      && (!route.activeUserId || route.activeUserId === identity.userId);
  });

  return matchedRoute?.aiCommand || effectiveAgent(studio, identity.platform);
}

function defaultWorkdir(studio: RelayDeskStudio) {
  return resolvePreferredWorkdir(studio.snapshot.workspace)
    || "未设置";
}

function currentRouteWorkdir(studio: RelayDeskStudio, channelKey: ChannelKey) {
  return routeForChannel(studio, channelKey)?.activeWorkDir;
}

function buildWorkdirState(studio: RelayDeskStudio, channelKey: ChannelKey): OverviewWorkdirState {
  const defaultPath = defaultWorkdir(studio);
  const currentPath = currentRouteWorkdir(studio, channelKey);
  if (!currentPath || currentPath === defaultPath) {
    return {
      defaultPath,
      currentPath: undefined,
      overridden: false,
    };
  }
  return {
    defaultPath,
    currentPath,
    overridden: true,
  };
}

function latestProbe(studio: RelayDeskStudio, channelKey: ChannelKey): ChannelProbeSnapshot | undefined {
  return studio.snapshot.probeResults[channelKey]
    ?? studio.snapshot.bootstrap?.probes[channelKey];
}

function continuityLabel(input: {
  readonly sessionId?: string;
  readonly historyCount: number;
}) {
  if (input.sessionId) return "原生续接";
  if (input.historyCount > 0) return "RelayDesk 续接";
  return "全新上下文";
}

function formatSessionUpdatedAt(updatedAt: number | undefined) {
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

function resolveSessionId(
  record: OverviewSessionRecord,
  preferredAgent: string,
) {
  const direct = record.sessionIds?.[preferredAgent];
  if (direct) return direct;
  const first = Object.values(record.sessionIds ?? {}).find(Boolean);
  return first ?? "";
}

function buildOverviewChannel(
  studio: RelayDeskStudio,
  channelKey: ChannelKey,
  enabled: boolean,
): OverviewChannel {
  const health = studio.snapshot.bootstrap?.health[channelKey];
  const probe = latestProbe(studio, channelKey);

  return {
    key: channelKey,
    title: channelDefinition(channelKey).title,
    agent: effectiveAgent(studio, channelKey),
    active: Boolean(routeForChannel(studio, channelKey)?.activeChatId),
    state: buildChannelState({
      enabled,
      configured: health?.configured,
      healthMessage: health?.message,
      probe,
    }),
    summary: buildOverviewChannelSummary({
      enabled,
      health,
      probe,
    }),
    workdir: buildWorkdirState(studio, channelKey),
  };
}

function sortOverviewChannels(left: OverviewChannel, right: OverviewChannel) {
  if (left.active !== right.active) {
    return left.active ? -1 : 1;
  }

  const stateDelta = statePriority(left.state) - statePriority(right.state);
  if (stateDelta !== 0) {
    return stateDelta;
  }

  return channelDefinitions.findIndex((item) => item.key === left.key)
    - channelDefinitions.findIndex((item) => item.key === right.key);
}

function normalizeOverviewTimeLabel(timeLabel?: string | null) {
  if (!timeLabel || timeLabel === "--:--:--") {
    return "--:--:--";
  }
  return timeLabel.slice(0, 8);
}

function summarizeOverviewLogLine(input: {
  readonly raw: string;
  readonly timeLabel?: string | null;
}): OverviewLog["lines"][number] | null {
  if (input.raw === "No journal files found.") {
    return {
      time: "--:--:--",
      detail: "等待首次启动后生成运行日志。",
      tone: "neutral",
    };
  }

  const match = /^(\d{4}-\d{2}-\d{2} )?(\d{2}:\d{2}:\d{2}) \[([A-Z]+)\] \[([^\]]+)\] (.+)$/.exec(input.raw.trim());
  const time = normalizeOverviewTimeLabel(input.timeLabel ?? match?.[2] ?? null);
  if (!match) {
    const detail = input.raw.trim();
    return detail
      ? {
          time,
          detail,
          tone: "neutral",
        }
      : null;
  }

  const scope = match[4];
  const message = match[5];
  const lowerMessage = message.toLowerCase();

  function item(detail: string, tone: "neutral" | "success" | "warning" = "neutral") {
    return {
      time,
      detail,
      tone,
    };
  }

  if (scope === "RelayWorker" && message === "RelayDesk runtime booting") {
    return item("服务启动中");
  }
  if (scope === "RelayWorker" && message.startsWith("worker online:")) {
    return item("服务已就绪", "success");
  }
  if (scope === "RelayWorker" && message === "RelayDesk runtime shutting down") {
    return item("服务正在停止", "warning");
  }
  if (scope === "QQ" && message === "QQ bot initialized") {
    return item("QQ 客户端已初始化");
  }
  if (scope === "QQ" && message.includes("READY")) {
    return item("QQ 已连接", "success");
  }
  if (scope === "QQ" && lowerMessage.includes("reconnecting")) {
    return item("QQ 重连中", "warning");
  }
  if (scope === "QQ" && lowerMessage.includes("gateway connected")) {
    return item("QQ 网关连接");
  }
  if (scope === "QQ" && lowerMessage.includes("gateway closed")) {
    return item("QQ 网关断开", "warning");
  }
  if (scope === "QQHandler" && message.includes("status=queued")) {
    return item("QQ 消息已排队", "warning");
  }
  if (scope === "QQHandler" && message.startsWith("QQ message handled:")) {
    return item("收到 QQ 消息");
  }
  if (scope === "AITask" && message.includes("[AITask] Starting:")) {
    const promptMatch = /prompt="([^"]+)/.exec(message);
    const prompt = promptMatch?.[1]?.trim();
    return item(prompt ? `开始执行：${prompt}` : "开始执行任务");
  }
  if (scope === "Queue" && message.startsWith("Queued task for")) {
    return item("当前会话进入排队", "warning");
  }
  if (scope === "CodexCli" && message.startsWith("Codex CLI closed: exitCode=0")) {
    return item("Codex 执行完成", "success");
  }
  if (scope === "Telegram" && message === "Telegram bot launched") {
    return item("Telegram 已连接", "success");
  }
  if (scope === "Feishu" && message === "Feishu WebSocket started") {
    return item("飞书已连接", "success");
  }
  if (scope === "WeChat" && message === "WeChat ilink runtime started") {
    return item("微信已连接", "success");
  }
  if (scope === "WeChat" && message === "WeChat client stopped") {
    return item("微信客户端已停止", "warning");
  }
  if (scope === "WeWork" && message.includes("authentication successful")) {
    return item("企业微信已连接", "success");
  }

  return item(message);
}

function overviewLogEntries(
  journal: RelayDeskStudio["snapshot"]["journal"] | BootstrapPayload["journal"] | null | undefined,
) {
  const liveEntries = journal?.entries?.map((entry) => summarizeOverviewLogLine({
    raw: entry.raw,
    timeLabel: entry.timeLabel,
  }));
  if (liveEntries && liveEntries.length > 0) {
    return liveEntries;
  }
  return (journal?.excerpt ?? []).map((raw) => summarizeOverviewLogLine({ raw }));
}

function buildRecentLog(studio: RelayDeskStudio): OverviewLog {
  const journal = studio.snapshot.journal ?? studio.snapshot.bootstrap?.journal ?? null;
  const file = journal?.latestFile ?? "暂无运行日志";
  const lines = overviewLogEntries(journal)
    .filter((line): line is NonNullable<ReturnType<typeof summarizeOverviewLogLine>> => Boolean(line))
    .slice(-8);

  return {
    file,
    lines: lines.length > 0 ? lines : [{
      time: "--:--:--",
      detail: "等待首次启动后记录运行轨迹...",
      tone: "neutral",
    }],
  };
}

function visibleIssues(studio: RelayDeskStudio) {
  const items = buildPriorityIssues(studio.snapshot).filter((item) => item.label !== "桌面环境");
  return items.length > 0 ? items : buildPriorityIssues(studio.snapshot);
}

function buildChannelStatus(studio: RelayDeskStudio): OverviewChannelStatus {
  const { enabledCount, healthyCount } = studio.snapshot;
  const running = isRuntimeRunning(studio.snapshot);
  const starting = isRuntimeStarting(studio.snapshot);
  if (enabledCount === 0) {
    return {
      label: "入口配置",
      value: "暂无配置",
      tone: "idle",
    };
  }

  const brokenCount = Math.max(enabledCount - healthyCount, 0);
  const parts = [];
  if (healthyCount > 0) {
    parts.push(`${healthyCount} 条就绪`);
  }
  if (brokenCount > 0) {
    parts.push(`${brokenCount} 条待修复`);
  }

  return {
    label: running ? "渠道状态" : starting ? "渠道启动" : "入口配置",
    value: parts.join(" / "),
    tone: healthyCount === enabledCount ? "success" : "warning",
  };
}

function buildLead(studio: RelayDeskStudio): OverviewLead {
  const runtime = readRuntimeSnapshot(studio.snapshot);
  const issues = visibleIssues(studio);

  if (runtime.phase === "starting") {
    return {
      title: "启动中",
      detail: "后台服务正在初始化渠道与会话。",
      tone: "warning",
    };
  }

  if (issues.length > 0) {
    return {
      title: runtime.phase === "running" ? "运行中 · 待处理" : "待配置",
      detail: runtime.phase === "running"
        ? "连接或工具仍有未完成项。"
        : "补齐平台和 AI 配置后即可启动。",
      tone: "warning",
    };
  }

  if (runtime.phase === "running") {
    return {
      title: "已就绪",
      detail: "可以从聊天平台发起远程操作。",
      tone: "success",
    };
  }

  return {
    title: "待启动",
    detail: "配置已齐备，启动后即可使用。",
    tone: "idle",
  };
}

function buildSecondaryAction(studio: RelayDeskStudio, issue: PriorityIssue | undefined) {
  if (!issue) {
    return {
      label: "查看诊断",
      run: () => Promise.resolve(studio.actions.setCurrentView("diagnosis")),
    };
  }

  const source = `${issue.label} ${issue.detail}`.toLowerCase();
  if (source.includes("后台服务")) {
    return {
      label: "查看诊断",
      run: () => Promise.resolve(studio.actions.setCurrentView("diagnosis")),
    };
  }

  if (source.includes("渠道") || source.includes("telegram") || source.includes("feishu") || source.includes("wechat")) {
    return {
      label: "去连接页",
      run: () => Promise.resolve(studio.actions.setCurrentView("connection")),
    };
  }

  if (source.includes("默认 ai") || source.includes("codex") || source.includes("claude") || source.includes("codebuddy") || source.includes("工作区")) {
    return {
      label: "去 AI 页",
      run: () => Promise.resolve(studio.actions.setCurrentView("ai")),
    };
  }

  return {
    label: "查看诊断",
    run: () => Promise.resolve(studio.actions.setCurrentView("diagnosis")),
  };
}

function buildIssueAction(studio: RelayDeskStudio, issue: PriorityIssue | undefined): OverviewAction {
  if (isRuntimeStarting(studio.snapshot)) {
    return {
      label: "启动中",
      tone: "soft",
      run: () => Promise.resolve(),
    };
  }

  if (!issue) {
    return {
      label: isRuntimeRunning(studio.snapshot) ? "测试连接" : "启动服务",
      tone: "primary",
      run: () => (isRuntimeRunning(studio.snapshot)
        ? studio.actions.probeChannel(preferredChannel(studio).key)
        : studio.actions.startRuntime()),
    };
  }

  const source = `${issue.label} ${issue.detail}`.toLowerCase();
  if (source.includes("后台服务")) {
    return {
      label: "启动服务",
      tone: "primary",
      run: () => studio.actions.startRuntime(),
    };
  }

  const secondary = buildSecondaryAction(studio, issue);
  return {
    label: secondary.label,
    tone: "soft",
    run: secondary.run,
  };
}

function buildSessionSummary(studio: RelayDeskStudio): OverviewSessionSummary {
  const primaryChannel = preferredChannel(studio);
  const route = routeForChannel(studio, primaryChannel.key);
  const workdir = buildWorkdirState(studio, primaryChannel.key);
  const hasActiveSession = Boolean(route?.activeChatId);
  const running = isRuntimeRunning(studio.snapshot);
  const continuityLabel = route?.continuityMode === "native"
    ? "原生续接"
    : route?.continuityMode === "relay"
      ? "RelayDesk 续接"
      : "全新上下文";

  return {
    entryLabel: hasActiveSession
      ? running
        ? "最近活跃入口"
        : "上次活跃入口"
      : "默认入口",
    entryValue: channelDefinition(primaryChannel.key).title,
    agentValue: effectiveAgent(studio, primaryChannel.key),
    continuityLabel,
    sessionId: route?.activeSessionId ?? "未建立",
    workspaceLabel: workdir.currentPath ? "会话工作区" : "默认工作区",
    workspacePath: workdir.currentPath || workdir.defaultPath,
    scopeDetail: hasActiveSession
      ? running
        ? workdir.overridden
          ? "当前会话目录已覆盖默认工作区。"
          : "当前会话沿用默认工作区。"
        : "服务未启动，以下为上次活跃会话摘要。"
      : "当前没有活跃会话，新请求会使用默认工作区。",
  };
}

function buildRecentSessions(studio: RelayDeskStudio): OverviewRecentSession[] {
  const primaryChannel = preferredChannel(studio);
  const primaryRoute = routeForChannel(studio, primaryChannel.key);
  const sessions = studio.snapshot.bootstrap?.sessions.sessions ?? {};

  return Object.entries(sessions)
    .map(([key, raw]) => {
      const identity = parseScopedSessionOwnerId(key);
      if (!identity) return null;
      const record = raw as OverviewSessionRecord;
      const preferredAgent = effectiveAgentForIdentity(studio, identity);
      const sessionId = resolveSessionId(record, preferredAgent);
      const historyCount = record.history?.length ?? 0;
      const isPrimary = primaryRoute?.channel === identity.platform
        && primaryRoute?.activeChatId === identity.chatId
        && (!primaryRoute?.activeUserId || primaryRoute.activeUserId === identity.userId);

      return {
        key,
        platformLabel: channelDefinition(identity.platform).title,
        agentValue: preferredAgent,
        continuityLabel: continuityLabel({ sessionId, historyCount }),
        sessionId: isPrimary
          ? ((primaryRoute?.activeSessionId ?? sessionId) || "未建立")
          : (sessionId || "未建立"),
        updatedAtLabel: formatSessionUpdatedAt(record.updatedAt),
        isPrimary,
      } satisfies OverviewRecentSession;
    })
    .filter((item): item is OverviewRecentSession => Boolean(item))
    .sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) {
        return left.isPrimary ? -1 : 1;
      }
      const leftRecord = sessions[left.key] as OverviewSessionRecord | undefined;
      const rightRecord = sessions[right.key] as OverviewSessionRecord | undefined;
      return (rightRecord?.updatedAt ?? 0) - (leftRecord?.updatedAt ?? 0);
    })
    .slice(0, RECENT_SESSION_LIMIT);
}

export function buildOverviewModel(studio: RelayDeskStudio) {
  const activeChannels: OverviewChannel[] = channelDefinitions
    .filter((def) => studio.snapshot.workspace.platforms?.[def.key]?.enabled)
    .map((def) => buildOverviewChannel(studio, def.key, true))
    .sort(sortOverviewChannels);
  const primaryChannel = preferredChannel(studio);
  const issues = visibleIssues(studio);
  const primaryIssue = issues[0];
  const summaryChannels = activeChannels.length > 0
    ? activeChannels
    : [buildOverviewChannel(studio, primaryChannel.key, false)];

  return {
    activeChannels,
    channelStatus: buildChannelStatus(studio),
    issueCount: issues.length,
    lead: buildLead(studio),
    log: buildRecentLog(studio),
    primaryAction: buildIssueAction(studio, primaryIssue),
    primaryIssue,
    recentSessions: buildRecentSessions(studio),
    running: isRuntimeRunning(studio.snapshot),
    starting: isRuntimeStarting(studio.snapshot),
    sessionSummary: buildSessionSummary(studio),
    summaryChannels,
    workdir: buildWorkdirState(studio, primaryChannel.key),
  } satisfies OverviewViewModel;
}
