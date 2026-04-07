import type {
  ChannelHealth,
  ChannelProbeSnapshot,
} from "../lib/models";

export interface ChannelState {
  readonly label: string;
  readonly tone: "green" | "amber" | "gray" | "red";
  readonly hint: string;
}

function formatProbeTimestamp(testedAt: string | undefined) {
  if (!testedAt) {
    return "";
  }

  const parsed = new Date(testedAt);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleString("zh-CN", {
    hour12: false,
  });
}

export function buildProbeResultText(
  probe: ChannelProbeSnapshot | undefined,
): string | undefined {
  if (!probe) {
    return undefined;
  }

  const testedAt = formatProbeTimestamp(probe.testedAt);
  if (probe.stale) {
    return testedAt
      ? `上次检测（${testedAt}）：${probe.message}`
      : `上次检测结果：${probe.message}`;
  }

  return testedAt ? `${probe.message}（${testedAt}）` : probe.message;
}

export function buildProbeSummary(
  probe: ChannelProbeSnapshot | undefined,
): string {
  if (!probe) {
    return "未测试";
  }

  if (probe.stale) {
    return "需复核";
  }

  return probe.message;
}

export function buildChannelState(options: {
  readonly enabled: boolean;
  readonly configured: boolean | undefined;
  readonly healthMessage?: string;
  readonly probe: ChannelProbeSnapshot | undefined;
}): ChannelState {
  if (!options.enabled) {
    return {
      label: "未启用",
      tone: "gray",
      hint: "先启用渠道，再继续填写接入信息。",
    };
  }

  if (!options.configured) {
    return {
      label: "待补全",
      tone: "amber",
      hint: "还有必要的接入信息未填写完整。",
    };
  }

  if (options.probe && !options.probe.stale && !options.probe.success) {
    return {
      label: "需修复",
      tone: "red",
      hint: "最近一次检测返回异常，请按提示修复。",
    };
  }

  if (options.probe?.stale) {
    return {
      label: "需复核",
      tone: "amber",
      hint: "保存配置已变更，请重新执行连接检测。",
    };
  }

  if (options.probe?.success) {
    return {
      label: "已验证",
      tone: "green",
      hint: "最近一次连接检测已通过，可以开始使用。",
    };
  }

  return {
    label: "待检测",
    tone: "amber",
    hint: "基础配置已经齐全，下一步执行连接检测。",
  };
}

export function channelTone(
  health: ChannelHealth | undefined,
  enabled: boolean | undefined,
  probe: ChannelProbeSnapshot | undefined,
) {
  return buildChannelState({
    enabled: Boolean(enabled),
    configured: health?.configured,
    healthMessage: health?.message,
    probe,
  }).tone;
}

export function channelLabel(
  health: ChannelHealth | undefined,
  enabled: boolean | undefined,
  probe: ChannelProbeSnapshot | undefined,
) {
  return buildChannelState({
    enabled: Boolean(enabled),
    configured: health?.configured,
    healthMessage: health?.message,
    probe,
  }).label;
}

export function channelHint(
  health: ChannelHealth | undefined,
  enabled: boolean | undefined,
  probe: ChannelProbeSnapshot | undefined,
) {
  return buildChannelState({
    enabled: Boolean(enabled),
    configured: health?.configured,
    healthMessage: health?.message,
    probe,
  }).hint;
}
