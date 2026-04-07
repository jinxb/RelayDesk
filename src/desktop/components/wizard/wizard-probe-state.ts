import type {
  ChannelKey,
  ChannelProbeSnapshot,
  FileConfigModel,
} from "../../../lib/models";
import {
  buildChannelState,
  buildProbeResultText,
} from "../../channel-probe-state";
import { resolvePendingProbeHealthMessage } from "../../probe-status";

type PlatformConfig = NonNullable<FileConfigModel["platforms"]>[ChannelKey];
type WizardBadgeColor = "gray" | "amber" | "green" | "red";

export interface WizardProbeState {
  readonly badgeColor: WizardBadgeColor;
  readonly badgeLabel: string;
  readonly detail?: string;
  readonly detailColor: string;
}

export function isWizardChannelConfigured(
  channelKey: ChannelKey,
  config: PlatformConfig | undefined,
) {
  if (!config) {
    return false;
  }

  if (channelKey === "telegram") {
    return Boolean(config.botToken);
  }
  if (channelKey === "feishu") {
    return Boolean(config.appId && config.appSecret);
  }
  if (channelKey === "qq") {
    return Boolean(config.appId && config.secret);
  }
  if (channelKey === "wework") {
    return Boolean(config.corpId && config.secret);
  }
  if (channelKey === "dingtalk") {
    return Boolean(config.clientId && config.clientSecret);
  }
  return Boolean(config.token && config.baseUrl);
}

function badgeColorForTone(tone: "green" | "amber" | "gray" | "red"): WizardBadgeColor {
  return tone;
}

function detailColorForTone(tone: "green" | "amber" | "gray" | "red") {
  if (tone === "green") {
    return "var(--success)";
  }
  if (tone === "red") {
    return "var(--danger)";
  }
  if (tone === "amber") {
    return "var(--warning)";
  }
  return "var(--text-muted)";
}

function resolveWizardProbeDetail(
  label: string,
  hint: string,
  probe: ChannelProbeSnapshot | undefined,
) {
  if (label === "迁移中") {
    return hint;
  }

  return probe ? (buildProbeResultText(probe) ?? hint) : undefined;
}

export function resolveWizardProbeState(options: {
  readonly channelKey: ChannelKey;
  readonly config: PlatformConfig | undefined;
  readonly probe: ChannelProbeSnapshot | undefined;
}): WizardProbeState {
  const channelState = buildChannelState({
    enabled: true,
    configured: isWizardChannelConfigured(options.channelKey, options.config),
    healthMessage: resolvePendingProbeHealthMessage(
      options.channelKey,
      options.config,
    ),
    probe: options.probe,
  });

  return {
    badgeColor: badgeColorForTone(channelState.tone),
    badgeLabel: channelState.label,
    detail: resolveWizardProbeDetail(
      channelState.label,
      channelState.hint,
      options.probe,
    ),
    detailColor: detailColorForTone(channelState.tone),
  };
}
