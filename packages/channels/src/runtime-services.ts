import type { CurrentTaskMediaHook } from "../../interaction/src/index.js";

export interface ChannelRuntimeServices {
  readonly currentTaskMediaHook?: CurrentTaskMediaHook;
}
