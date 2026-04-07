import type { FileConfig, Platform } from "../../state/src/index.js";
import {
  readStoredChannelProbes,
  writeStoredChannelProbe,
  type StoredChannelProbe,
} from "../../state/src/index.js";

const knownChannels: readonly Platform[] = [
  "telegram",
  "feishu",
  "qq",
  "wechat",
  "wework",
  "dingtalk",
];

export interface ChannelProbeSnapshot {
  readonly success: boolean;
  readonly message: string;
  readonly testedAt: string;
  readonly stale: boolean;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProbeConfig(
  channel: Platform,
  config: Record<string, unknown> | undefined,
): Record<string, string> {
  const source = config ?? {};
  switch (channel) {
    case "telegram":
      return {
        botToken: textValue(source.botToken),
      };
    case "feishu":
      return {
        appId: textValue(source.appId),
        appSecret: textValue(source.appSecret),
      };
    case "qq":
      return {
        appId: textValue(source.appId),
        secret: textValue(source.secret),
      };
    case "wework":
      return {
        corpId: textValue(source.corpId),
        secret: textValue(source.secret),
        wsUrl: textValue(source.wsUrl),
      };
    case "dingtalk":
      return {
        clientId: textValue(source.clientId),
        clientSecret: textValue(source.clientSecret),
      };
    case "wechat":
      return {
        token: textValue(source.token),
        baseUrl: textValue(source.baseUrl),
      };
  }
}

function hashString(input: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `cp_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function fingerprintChannelProbeConfig(
  channel: Platform,
  config: Record<string, unknown> | undefined,
): string {
  return hashString(JSON.stringify(normalizeProbeConfig(channel, config)));
}

export function recordChannelProbeResult(
  channel: Platform,
  config: Record<string, unknown> | undefined,
  success: boolean,
  message: string,
): ChannelProbeSnapshot {
  const stored: StoredChannelProbe = {
    success,
    message,
    testedAt: new Date().toISOString(),
    configFingerprint: fingerprintChannelProbeConfig(channel, config),
  };
  writeStoredChannelProbe(channel, stored);
  return {
    success: stored.success,
    message: stored.message,
    testedAt: stored.testedAt,
    stale: false,
  };
}

export function buildChannelProbeSnapshots(
  workspace: FileConfig,
): Partial<Record<Platform, ChannelProbeSnapshot>> {
  const stored = readStoredChannelProbes();
  const snapshots: Partial<Record<Platform, ChannelProbeSnapshot>> = {};
  for (const channel of knownChannels) {
    const probe = stored[channel];
    if (!probe) {
      continue;
    }

    const config = workspace.platforms?.[channel] as Record<string, unknown> | undefined;
    snapshots[channel] = {
      success: probe.success,
      message: probe.message,
      testedAt: probe.testedAt,
      stale:
        probe.configFingerprint !== fingerprintChannelProbeConfig(channel, config),
    };
  }
  return snapshots;
}
