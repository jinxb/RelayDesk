export type ChannelKey =
  | "telegram"
  | "feishu"
  | "qq"
  | "wechat"
  | "wework"
  | "dingtalk";

export type AgentKey = "claude" | "codex" | "codebuddy";

export interface ChannelHealth {
  configured: boolean;
  enabled: boolean;
  healthy: boolean;
  message?: string;
}

export interface ChannelProbeSnapshot {
  success: boolean;
  message: string;
  testedAt: string;
  stale: boolean;
}

export interface RuntimeRouteSummary {
  channel: ChannelKey;
  enabled: boolean;
  aiCommand: string;
  defaultWorkDir: string;
  activeChatId?: string;
  activeUserId?: string;
  activeWorkDir?: string;
  activeSessionId?: string;
  continuityMode?: "fresh" | "relay" | "native";
  hasActiveOverride: boolean;
}

export interface FileConfigModel {
  aiCommand?: AgentKey;
  env?: Record<string, string>;
  runtime?: {
    keepAwake?: boolean;
  };
  logDir?: string;
  logLevel?: string;
  tools?: {
    claude?: {
      cliPath?: string;
      workDir?: string;
      timeoutMs?: number;
      proxy?: string;
      env?: Record<string, string>;
    };
    codex?: {
      cliPath?: string;
      workDir?: string;
      timeoutMs?: number;
      idleTimeoutMs?: number;
      proxy?: string;
    };
    codebuddy?: {
      cliPath?: string;
      timeoutMs?: number;
      idleTimeoutMs?: number;
    };
  };
  platforms?: {
    telegram?: {
      enabled?: boolean;
      aiCommand?: AgentKey;
      botToken?: string;
      proxy?: string;
      allowedUserIds?: string[];
    };
    feishu?: {
      enabled?: boolean;
      aiCommand?: AgentKey;
      appId?: string;
      appSecret?: string;
      allowedUserIds?: string[];
    };
    qq?: {
      enabled?: boolean;
      aiCommand?: AgentKey;
      appId?: string;
      secret?: string;
      allowedUserIds?: string[];
    };
    wework?: {
      enabled?: boolean;
      aiCommand?: AgentKey;
      corpId?: string;
      secret?: string;
      wsUrl?: string;
      allowedUserIds?: string[];
    };
    dingtalk?: {
      enabled?: boolean;
      aiCommand?: AgentKey;
      clientId?: string;
      clientSecret?: string;
      cardTemplateId?: string;
      allowedUserIds?: string[];
    };
    wechat?: {
      enabled?: boolean;
      aiCommand?: AgentKey;
      token?: string;
      baseUrl?: string;
      allowedUserIds?: string[];
    };
  };
}

export interface RuntimeSnapshot {
  running: boolean;
  pid: number | null;
  phase: "stopped" | "starting" | "running";
  startupError?: string | null;
}

export interface JournalEntryModel {
  raw: string;
  occurredAt: string | null;
  timeLabel: string;
  level: string;
  tag: string | null;
  title: string;
  detail: string;
  tone: "neutral" | "success" | "warning" | "danger";
}

export interface BootstrapPayload {
  brand: {
    name: string;
    line: string;
    apiBaseUrl: string;
  };
  workspace: FileConfigModel;
  claudeEnv: Record<string, string>;
  runtime: RuntimeSnapshot;
  health: Record<ChannelKey, ChannelHealth>;
  probes: Partial<Record<ChannelKey, ChannelProbeSnapshot>>;
  routes: RuntimeRouteSummary[];
  diagnostics: {
    nodeVersion: string;
    platform: string;
    configPath: string;
    appHome: string;
    logDir: string;
    codexReady: boolean;
    codexLongPromptReady?: boolean;
    codexIssue?: string | null;
    codebuddyReady: boolean;
    claudeReady: boolean;
  };
  sessions: {
    sessionCount: number;
    sessions: Record<string, unknown>;
    activeChats: Record<string, unknown>;
  };
  journal: {
    latestFile: string | null;
    excerpt: string[];
    entries?: JournalEntryModel[];
    updatedAt?: string | null;
    totalLines?: number;
    truncated?: boolean;
    notice?: string | null;
  };
}

export interface ValidationResult {
  ok: boolean;
  issues: string[];
  requiredChannels: ChannelKey[];
  requiredAgents: AgentKey[];
}

export interface ChannelProbeResult {
  success: boolean;
  message: string;
  probe: ChannelProbeSnapshot;
}
