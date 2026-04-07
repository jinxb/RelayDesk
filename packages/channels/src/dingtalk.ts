import { getDingTalkActiveTarget, type Config } from "../../state/src/index.js";
import {
  formatDingTalkInitError,
  initDingTalk,
  sendProactiveText,
  stopDingTalk,
} from "./dingtalk/client.js";
import { setupDingTalkHandlers } from "./dingtalk/event-handler.js";
import { SessionManager } from "../../state/src/index.js";
import type { ChannelRuntimeServices } from "./runtime-services.js";

export type DingTalkChannelHandle = ReturnType<typeof setupDingTalkHandlers>;

export async function startDingTalkChannel(
  config: Config,
  sessions: SessionManager,
  services: ChannelRuntimeServices = {},
): Promise<DingTalkChannelHandle> {
  const handle = setupDingTalkHandlers(config, sessions, services);
  await initDingTalk(config, handle.handleEvent);
  return handle;
}

export function explainDingTalkInitError(error: unknown): string {
  return formatDingTalkInitError(error);
}

export async function sendDingTalkLifecycleNotice(
  message: string,
): Promise<void> {
  const target = getDingTalkActiveTarget();
  if (!target) return;
  await sendProactiveText(target, message);
}

export function stopDingTalkChannel(handle: DingTalkChannelHandle | null): void {
  handle?.stop();
  stopDingTalk();
}
