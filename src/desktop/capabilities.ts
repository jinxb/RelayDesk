import {
  CHANNEL_CAPABILITIES,
  type CapabilityLevel,
  type ChannelCapabilities,
} from "../../packages/interaction/src/shared/capabilities.js";
import type { ChannelKey } from "../lib/models";

export type { CapabilityLevel, ChannelCapabilities };

export const desktopChannelCapabilities: Record<ChannelKey, ChannelCapabilities> =
  CHANNEL_CAPABILITIES;
