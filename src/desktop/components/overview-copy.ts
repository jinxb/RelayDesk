import type { ChannelHealth, ChannelProbeSnapshot } from "../../lib/models";

interface OverviewChannelSummaryOptions {
  readonly enabled: boolean;
  readonly health: ChannelHealth | undefined;
  readonly probe: ChannelProbeSnapshot | undefined;
}

const REQUIRED_PAIR_PATTERNS = [
  { pattern: "app id and secret are both required", summary: "缺少 App ID 与 Secret" },
  { pattern: "client id and secret are both required", summary: "缺少 Client ID 与 Secret" },
  { pattern: "bot id and secret are both required", summary: "缺少 Bot ID 与 Secret" },
  { pattern: "corp id and secret are both required", summary: "缺少 Corp ID 与 Secret" },
];

const REQUIRED_SINGLE_PATTERNS = [
  { pattern: "bot token is required", summary: "缺少 Bot Token" },
  { pattern: "app id is required", summary: "缺少 App ID" },
  { pattern: "app secret is required", summary: "缺少 App Secret" },
  { pattern: "client id is required", summary: "缺少 Client ID" },
  { pattern: "client secret is required", summary: "缺少 Client Secret" },
  { pattern: "secret is required", summary: "缺少 Secret" },
  { pattern: "token is required", summary: "缺少 Token" },
];

function compactOverviewIssue(message: string | undefined) {
  if (!message) {
    return undefined;
  }

  const normalized = message.trim();
  const lower = normalized.toLowerCase();

  if (lower.includes("wechat requires ilink/getupdates credentials")) {
    return "缺少 token 与 baseUrl";
  }

  if (lower.includes("token and baseurl")) {
    return "缺少 token 与 baseUrl";
  }

  for (const candidate of REQUIRED_PAIR_PATTERNS) {
    if (lower.includes(candidate.pattern)) {
      return candidate.summary;
    }
  }

  for (const candidate of REQUIRED_SINGLE_PATTERNS) {
    if (lower.includes(candidate.pattern)) {
      return candidate.summary;
    }
  }

  if (normalized.length <= 22) {
    return normalized;
  }

  return undefined;
}

export function buildOverviewChannelSummary(options: OverviewChannelSummaryOptions): string {
  if (!options.enabled) {
    if (options.health?.configured) {
      return "参数已就绪，启用后接入";
    }
    return compactOverviewIssue(options.health?.message) || "启用并补齐参数后接入";
  }

  if (options.health && !options.health.configured) {
    return compactOverviewIssue(options.health.message) || "接入参数缺失";
  }

  if (options.probe) {
    if (options.probe.stale) {
      return "配置已变更，待重检";
    }
    if (options.probe.success) {
      return "最近检测通过";
    }
    return compactOverviewIssue(options.probe.message) || "连接检测异常";
  }

  return "等待首次检测";
}
