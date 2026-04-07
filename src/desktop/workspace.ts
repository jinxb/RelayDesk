import type { AgentKey, FileConfigModel } from "../lib/models";

const DEFAULT_TOOL_TIMEOUT_MS = 600000;
const DEFAULT_CODEX_TIMEOUT_MS = 1800000;
const DEFAULT_IDLE_TIMEOUT_MS = 600000;
const DEFAULT_LOG_LEVEL = "INFO";
const DEFAULT_AGENT: AgentKey = "claude";

function normalizeClaudeTool(input: FileConfigModel["tools"] extends infer T
  ? T extends { claude?: infer U }
    ? U | undefined
    : never
  : never) {
  return {
    cliPath: input?.cliPath ?? "",
    workDir: input?.workDir ?? "",
    timeoutMs: input?.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
    proxy: input?.proxy ?? "",
    env: { ...(input?.env ?? {}) },
  };
}

function normalizeCodexTool(input: FileConfigModel["tools"] extends infer T
  ? T extends { codex?: infer U }
    ? U | undefined
    : never
  : never) {
  return {
    cliPath: input?.cliPath ?? "codex",
    workDir: input?.workDir ?? "",
    timeoutMs: input?.timeoutMs ?? DEFAULT_CODEX_TIMEOUT_MS,
    idleTimeoutMs: input?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
    proxy: input?.proxy ?? "",
  };
}

function normalizeCodeBuddyTool(input: FileConfigModel["tools"] extends infer T
  ? T extends { codebuddy?: infer U }
    ? U | undefined
    : never
  : never) {
  return {
    cliPath: input?.cliPath ?? "codebuddy",
    timeoutMs: input?.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
    idleTimeoutMs: input?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
  };
}

function normalizePlatformBase<T extends { enabled?: boolean; aiCommand?: AgentKey }>(
  input: T | undefined,
) {
  return {
    enabled: input?.enabled ?? false,
    aiCommand: input?.aiCommand,
    allowedUserIds: [...((input as { allowedUserIds?: string[] } | undefined)?.allowedUserIds ?? [])],
  };
}

export function normalizeWorkspace(input?: FileConfigModel): FileConfigModel {
  return {
    aiCommand: input?.aiCommand ?? DEFAULT_AGENT,
    env: { ...(input?.env ?? {}) },
    runtime: {
      keepAwake: input?.runtime?.keepAwake ?? false,
    },
    logDir: input?.logDir ?? "",
    logLevel: input?.logLevel ?? DEFAULT_LOG_LEVEL,
    tools: {
      claude: normalizeClaudeTool(input?.tools?.claude),
      codex: normalizeCodexTool(input?.tools?.codex),
      codebuddy: normalizeCodeBuddyTool(input?.tools?.codebuddy),
    },
    platforms: {
      telegram: {
        ...normalizePlatformBase(input?.platforms?.telegram),
        botToken: input?.platforms?.telegram?.botToken ?? "",
        proxy: input?.platforms?.telegram?.proxy ?? "",
      },
      feishu: {
        ...normalizePlatformBase(input?.platforms?.feishu),
        appId: input?.platforms?.feishu?.appId ?? "",
        appSecret: input?.platforms?.feishu?.appSecret ?? "",
      },
      qq: {
        ...normalizePlatformBase(input?.platforms?.qq),
        appId: input?.platforms?.qq?.appId ?? "",
        secret: input?.platforms?.qq?.secret ?? "",
      },
      wework: {
        ...normalizePlatformBase(input?.platforms?.wework),
        corpId: input?.platforms?.wework?.corpId ?? "",
        secret: input?.platforms?.wework?.secret ?? "",
        wsUrl: input?.platforms?.wework?.wsUrl ?? "",
      },
      dingtalk: {
        ...normalizePlatformBase(input?.platforms?.dingtalk),
        clientId: input?.platforms?.dingtalk?.clientId ?? "",
        clientSecret: input?.platforms?.dingtalk?.clientSecret ?? "",
        cardTemplateId: input?.platforms?.dingtalk?.cardTemplateId ?? "",
      },
      wechat: {
        ...normalizePlatformBase(input?.platforms?.wechat),
        token: input?.platforms?.wechat?.token ?? "",
        baseUrl: input?.platforms?.wechat?.baseUrl ?? "",
      },
    },
  };
}

export function cloneWorkspace(workspace: FileConfigModel): FileConfigModel {
  return JSON.parse(JSON.stringify(workspace)) as FileConfigModel;
}

export function editWorkspace(
  workspace: FileConfigModel,
  recipe: (draft: FileConfigModel) => void,
) {
  const draft = cloneWorkspace(workspace);
  recipe(draft);
  return draft;
}

export function stringifyWorkspace(workspace: FileConfigModel) {
  return JSON.stringify(workspace, null, 2);
}

export function stringifyRecord(input: Record<string, string>) {
  return JSON.stringify(input, null, 2);
}

export function resolvePreferredWorkdir(workspace: FileConfigModel) {
  const defaultAgent = workspace.aiCommand ?? DEFAULT_AGENT;
  if (defaultAgent === "claude" && workspace.tools?.claude?.workDir) {
    return workspace.tools.claude.workDir;
  }

  if (defaultAgent === "codex" && workspace.tools?.codex?.workDir) {
    return workspace.tools.codex.workDir;
  }

  return workspace.tools?.claude?.workDir
    || workspace.tools?.codex?.workDir
    || "";
}

export function setPreferredWorkdir(workspace: FileConfigModel, value: string) {
  if (workspace.tools?.claude) {
    workspace.tools.claude.workDir = value;
  }
  if (workspace.tools?.codex) {
    workspace.tools.codex.workDir = value;
  }
}

export function parseWorkspaceSource(source: string) {
  return normalizeWorkspace(JSON.parse(source) as FileConfigModel);
}

export function formatAllowList(items?: string[]) {
  return (items ?? []).join(", ");
}

export function parseAllowList(input: string) {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseJsonRecord(source: string, label: string) {
  const parsed = JSON.parse(source.trim() || "{}");
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error(`${label} must be a flat JSON object.`);
  }

  const entries = Object.entries(parsed);
  const record: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof value !== "string") {
      throw new Error(`${label} values must be strings.`);
    }
    record[key] = value;
  }

  return record;
}
