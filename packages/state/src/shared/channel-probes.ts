import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { APP_HOME } from "../constants.js";
import type { Platform } from "../config.js";

const CHANNEL_PROBES_FILE = join(APP_HOME, "data", "channel-probes.json");
const knownChannels: readonly Platform[] = [
  "telegram",
  "feishu",
  "qq",
  "wechat",
  "wework",
  "dingtalk",
];

export interface StoredChannelProbe {
  readonly success: boolean;
  readonly message: string;
  readonly testedAt: string;
  readonly configFingerprint: string;
}

export type StoredChannelProbeMap = Partial<Record<Platform, StoredChannelProbe>>;

function isStoredChannelProbe(value: unknown): value is StoredChannelProbe {
  if (!value || typeof value !== "object") {
    return false;
  }

  const probe = value as Record<string, unknown>;
  return (
    typeof probe.success === "boolean" &&
    typeof probe.message === "string" &&
    typeof probe.testedAt === "string" &&
    typeof probe.configFingerprint === "string"
  );
}

function parseStoredChannelProbes(input: unknown): StoredChannelProbeMap {
  if (!input || typeof input !== "object") {
    return {};
  }

  const parsed: StoredChannelProbeMap = {};
  for (const channel of knownChannels) {
    const candidate = (input as Record<string, unknown>)[channel];
    if (isStoredChannelProbe(candidate)) {
      parsed[channel] = candidate;
    }
  }
  return parsed;
}

export function readStoredChannelProbes(): StoredChannelProbeMap {
  try {
    if (!existsSync(CHANNEL_PROBES_FILE)) {
      return {};
    }

    const raw = JSON.parse(readFileSync(CHANNEL_PROBES_FILE, "utf-8")) as unknown;
    return parseStoredChannelProbes(raw);
  } catch {
    return {};
  }
}

export function writeStoredChannelProbe(
  channel: Platform,
  probe: StoredChannelProbe,
): StoredChannelProbeMap {
  const next = {
    ...readStoredChannelProbes(),
    [channel]: probe,
  };
  const dir = dirname(CHANNEL_PROBES_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CHANNEL_PROBES_FILE, JSON.stringify(next, null, 2), "utf-8");
  return next;
}
