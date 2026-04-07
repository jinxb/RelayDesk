import type { ChannelKey } from "../lib/models";
import { channelDefinitions } from "./catalog";

interface ChannelSelectionInput {
  readonly current: ChannelKey;
  readonly dialogOpen: boolean;
  readonly enabledByChannel: Partial<Record<ChannelKey, boolean | undefined>>;
  readonly configuredByChannel: Partial<Record<ChannelKey, boolean | undefined>>;
}

function preferredChannel(input: Omit<ChannelSelectionInput, "dialogOpen">): ChannelKey {
  if (input.enabledByChannel[input.current] || input.configuredByChannel[input.current]) {
    return input.current;
  }

  const enabled = channelDefinitions.find((channel) => input.enabledByChannel[channel.key]);
  if (enabled) {
    return enabled.key;
  }

  const configured = channelDefinitions.find(
    (channel) => input.configuredByChannel[channel.key],
  );
  return configured?.key ?? input.current;
}

export function resolveSelectedChannel(
  input: ChannelSelectionInput,
): ChannelKey {
  if (input.dialogOpen) {
    return input.current;
  }

  return preferredChannel(input);
}
