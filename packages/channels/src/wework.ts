import type { Config } from "../../state/src/index.js";
import { initWeWork, stopWeWork } from "./wework/client.js";
import { setupWeWorkHandlers } from "./wework/event-handler.js";
import { sendProactiveTextReply as sendWeComNotice } from "./wework/message-sender.js";
import { getActiveChatId, getActiveRouteAnchor, SessionManager } from "../../state/src/index.js";
import type { ChannelRuntimeServices } from "./runtime-services.js";

export type WeComChannelHandle = ReturnType<typeof setupWeWorkHandlers>;

export async function startWeComChannel(
  config: Config,
  sessions: SessionManager,
  services: ChannelRuntimeServices = {},
): Promise<WeComChannelHandle> {
  const handle = setupWeWorkHandlers(config, sessions, services);
  await initWeWork(config, handle.handleEvent);
  return handle;
}

export async function sendWeComLifecycleNotice(
  message: string,
): Promise<void> {
  const chatId = getActiveChatId("wework");
  if (!chatId) return;
  await sendWeComNotice(chatId, message);
}

export function resolveWeComWorkspace(
  sessions: SessionManager,
): string | undefined {
  const active = getActiveRouteAnchor("wework");
  return active
    ? sessions.getWorkDirForRoute("wework", active.chatId, active.userId)
    : undefined;
}

export function stopWeComChannel(handle: WeComChannelHandle | null): void {
  handle?.stop();
  stopWeWork();
}
