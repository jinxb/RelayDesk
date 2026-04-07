import type { ChannelKey, FileConfigModel } from "../lib/models";
import type { StudioTone } from "./types";
type PlatformConfig = NonNullable<FileConfigModel["platforms"]>[ChannelKey];

export function resolvePendingProbeHealthMessage(
  _channel: ChannelKey,
  _config: PlatformConfig | undefined,
) {
  return undefined;
}

export function buildProbeSuccessStatus(options: {
  readonly channel: ChannelKey;
  readonly channelName: string;
  readonly config: PlatformConfig | undefined;
}): { message: string; tone: StudioTone } {
  return {
    message: `${options.channelName} 连通性检测完成。`,
    tone: "success",
  };
}
