import { execFileSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { FileConfig } from "../../state/src/index.js";
import {
  getWeChatConfigIssue,
  hasWeChatIlinkCredentials,
} from "../../state/src/wechat-route.js";

export const knownAgents = ["claude", "codex", "codebuddy"] as const;
export const knownChannels = [
  "telegram",
  "feishu",
  "qq",
  "wechat",
  "wework",
  "dingtalk",
] as const;

export type AgentKey = (typeof knownAgents)[number];
export type ChannelKey = (typeof knownChannels)[number];

function workDirForAgent(workspace: FileConfig, agent: AgentKey): string {
  if (agent === "claude") {
    return workspace.tools?.claude?.workDir?.trim() ?? "";
  }

  if (agent === "codex") {
    return workspace.tools?.codex?.workDir?.trim() ?? "";
  }

  return "";
}

export interface WorkspaceValidationResult {
  ok: boolean;
  issues: string[];
  requiredChannels: ChannelKey[];
  requiredAgents: AgentKey[];
}

export function normalizeWorkspaceConfig(
  input: FileConfig | undefined,
): FileConfig {
  return {
    aiCommand: (input?.aiCommand as AgentKey | undefined) ?? "claude",
    env: { ...(input?.env ?? {}) },
    runtime: {
      keepAwake: input?.runtime?.keepAwake ?? false,
    },
    logDir: input?.logDir ?? "",
    logLevel: input?.logLevel ?? "INFO",
    tools: {
      claude: {
        ...(input?.tools?.claude ?? {}),
      },
      codex: {
        ...(input?.tools?.codex ?? {}),
      },
      codebuddy: {
        ...(input?.tools?.codebuddy ?? {}),
      },
    },
    platforms: {
      telegram: {
        enabled: input?.platforms?.telegram?.enabled ?? false,
        aiCommand: input?.platforms?.telegram?.aiCommand,
        botToken: input?.platforms?.telegram?.botToken ?? "",
        proxy: input?.platforms?.telegram?.proxy ?? "",
        allowedUserIds: [...(input?.platforms?.telegram?.allowedUserIds ?? [])],
      },
      feishu: {
        enabled: input?.platforms?.feishu?.enabled ?? false,
        aiCommand: input?.platforms?.feishu?.aiCommand,
        appId: input?.platforms?.feishu?.appId ?? "",
        appSecret: input?.platforms?.feishu?.appSecret ?? "",
        allowedUserIds: [...(input?.platforms?.feishu?.allowedUserIds ?? [])],
      },
      qq: {
        enabled: input?.platforms?.qq?.enabled ?? false,
        aiCommand: input?.platforms?.qq?.aiCommand,
        appId: input?.platforms?.qq?.appId ?? "",
        secret: input?.platforms?.qq?.secret ?? "",
        allowedUserIds: [...(input?.platforms?.qq?.allowedUserIds ?? [])],
      },
      wechat: {
        enabled: input?.platforms?.wechat?.enabled ?? false,
        aiCommand: input?.platforms?.wechat?.aiCommand,
        token: input?.platforms?.wechat?.token ?? "",
        baseUrl: input?.platforms?.wechat?.baseUrl ?? "",
        allowedUserIds: [...(input?.platforms?.wechat?.allowedUserIds ?? [])],
      },
      wework: {
        enabled: input?.platforms?.wework?.enabled ?? false,
        aiCommand: input?.platforms?.wework?.aiCommand,
        corpId: input?.platforms?.wework?.corpId ?? "",
        secret: input?.platforms?.wework?.secret ?? "",
        wsUrl: input?.platforms?.wework?.wsUrl ?? "",
        allowedUserIds: [...(input?.platforms?.wework?.allowedUserIds ?? [])],
      },
      dingtalk: {
        enabled: input?.platforms?.dingtalk?.enabled ?? false,
        aiCommand: input?.platforms?.dingtalk?.aiCommand,
        clientId: input?.platforms?.dingtalk?.clientId ?? "",
        clientSecret: input?.platforms?.dingtalk?.clientSecret ?? "",
        cardTemplateId: input?.platforms?.dingtalk?.cardTemplateId ?? "",
        allowedUserIds: [...(input?.platforms?.dingtalk?.allowedUserIds ?? [])],
      },
    },
  };
}

export function sanitizeClaudeEnv(
  env: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    const clean = String(value ?? "").trim();
    if (clean) next[key] = clean;
  }
  return next;
}

export function workspaceUsedAgents(workspace: FileConfig): AgentKey[] {
  const used = new Set<AgentKey>([
    (workspace.aiCommand as AgentKey | undefined) ?? "claude",
  ]);
  for (const channel of knownChannels) {
    const platform = workspace.platforms?.[channel];
    if (!platform?.enabled) {
      continue;
    }

    const picked = platform.aiCommand as
      | AgentKey
      | undefined;
    if (picked) used.add(picked);
  }
  return [...used];
}

export function resolveRuntimeWorkTree(workspace: FileConfig): string {
  const normalizedDefaultAgent = (workspace.aiCommand as AgentKey | undefined) ?? "claude";
  const preferred = workDirForAgent(workspace, normalizedDefaultAgent);
  if (preferred) {
    return preferred;
  }

  for (const agent of knownAgents) {
    const candidate = workDirForAgent(workspace, agent);
    if (candidate) {
      return candidate;
    }
  }

  return process.cwd();
}

export function resolveClaudeCredentialState(
  workspace: FileConfig,
  claudeEnv: Record<string, string>,
): boolean {
  const merged = {
    ...(workspace.env ?? {}),
    ...(workspace.tools?.claude?.env ?? {}),
    ...claudeEnv,
  };

  return Boolean(
    process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_AUTH_TOKEN ||
      process.env.CLAUDE_CODE_OAUTH_TOKEN ||
      process.env.ANTHROPIC_BASE_URL ||
      merged.ANTHROPIC_API_KEY ||
      merged.ANTHROPIC_AUTH_TOKEN ||
      merged.CLAUDE_CODE_OAUTH_TOKEN ||
      merged.ANTHROPIC_BASE_URL,
  );
}

export function findCodexAuth(): boolean {
  if (process.env.OPENAI_API_KEY) return true;
  const spots = [
    join(homedir(), ".codex", "auth.json"),
    join(homedir(), ".config", "codex", "auth.json"),
    join(homedir(), "AppData", "Roaming", "codex", "auth.json"),
  ];

  return spots.some((spot) => {
    try {
      return existsSync(spot) && readFileSync(spot, "utf-8").trim().length > 0;
    } catch {
      return false;
    }
  });
}

export function commandReady(commandOrPath: string | undefined): boolean {
  const candidate = (commandOrPath ?? "").trim();
  if (!candidate) return false;

  if (
    candidate.startsWith("/") ||
    candidate.includes("\\") ||
    candidate.includes("/")
  ) {
    try {
      accessSync(candidate, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  const resolver = process.platform === "win32" ? "where" : "which";
  try {
    execFileSync(resolver, [candidate], {
      stdio: "pipe",
      windowsHide: process.platform === "win32",
    });
    return true;
  } catch {
    return false;
  }
}

function enabledChannelIssues(workspace: FileConfig): {
  activeChannels: ChannelKey[];
  issues: string[];
} {
  const issues: string[] = [];
  const activeChannels: ChannelKey[] = [];

  const telegram = workspace.platforms?.telegram;
  if (telegram?.enabled) {
    if (!telegram.botToken) issues.push("telegram is enabled but missing required credentials.");
    else activeChannels.push("telegram");
  }

  const feishu = workspace.platforms?.feishu;
  if (feishu?.enabled) {
    if (!(feishu.appId && feishu.appSecret)) issues.push("feishu is enabled but missing required credentials.");
    else activeChannels.push("feishu");
  }

  const qq = workspace.platforms?.qq;
  if (qq?.enabled) {
    if (!(qq.appId && qq.secret)) issues.push("qq is enabled but missing required credentials.");
    else activeChannels.push("qq");
  }

  const wework = workspace.platforms?.wework;
  if (wework?.enabled) {
    if (!(wework.corpId && wework.secret)) issues.push("wework is enabled but missing required credentials.");
    else activeChannels.push("wework");
  }

  const dingtalk = workspace.platforms?.dingtalk;
  if (dingtalk?.enabled) {
    if (!(dingtalk.clientId && dingtalk.clientSecret)) issues.push("dingtalk is enabled but missing required credentials.");
    else activeChannels.push("dingtalk");
  }

  const wechat = workspace.platforms?.wechat;
  if (wechat?.enabled) {
    if (!hasWeChatIlinkCredentials(wechat)) {
      issues.push(getWeChatConfigIssue(wechat as Record<string, unknown>));
    } else {
      activeChannels.push("wechat");
    }
  }

  if (activeChannels.length === 0) {
    issues.push("At least one fully credentialed channel must be active.");
  }

  return { activeChannels, issues };
}

function resolveRawWechatConfig(
  workspace: FileConfig,
): Record<string, unknown> | undefined {
  return workspace.platforms?.wechat as Record<string, unknown> | undefined;
}

export function validateWorkspace(
  workspace: FileConfig,
  claudeEnv: Record<string, string>,
): WorkspaceValidationResult {
  const normalized = normalizeWorkspaceConfig(workspace);
  const { activeChannels, issues } = enabledChannelIssues({
    ...normalized,
    platforms: {
      ...normalized.platforms,
      wechat: normalized.platforms?.wechat?.enabled
        ? {
            ...normalized.platforms.wechat,
            // Preserve raw unsupported keys long enough for validation messaging.
            ...resolveRawWechatConfig(workspace),
          }
        : normalized.platforms?.wechat,
    },
  });
  const requiredAgents = workspaceUsedAgents(normalized);

  for (const agent of requiredAgents) {
    if (agent === "claude" && !resolveClaudeCredentialState(normalized, claudeEnv)) {
      issues.push("Claude route selected without reachable credentials.");
    }

    if (
      agent === "codex" &&
      !commandReady(normalized.tools?.codex?.cliPath ?? "codex")
    ) {
      issues.push("Codex route selected but the CLI path cannot be resolved.");
    }

    if (
      agent === "codebuddy" &&
      !commandReady(normalized.tools?.codebuddy?.cliPath ?? "codebuddy")
    ) {
      issues.push("CodeBuddy route selected but the CLI path cannot be resolved.");
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    requiredChannels: activeChannels,
    requiredAgents,
  };
}
