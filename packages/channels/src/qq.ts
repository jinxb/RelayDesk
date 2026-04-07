import type { Config } from "../../state/src/index.js";
import { initQQ, stopQQ } from "./qq/client.js";
import { setupQQHandlers } from "./qq/event-handler.js";
import { sendTextReply as sendQQNotice } from "./qq/message-sender.js";
import { getActiveChatId, SessionManager } from "../../state/src/index.js";
import type { ChannelRuntimeServices } from "./runtime-services.js";

export type QQChannelHandle = ReturnType<typeof setupQQHandlers>;

export async function startQQChannel(
  config: Config,
  sessions: SessionManager,
  services: ChannelRuntimeServices = {},
): Promise<QQChannelHandle> {
  const handle = setupQQHandlers(config, sessions, services);
  await initQQ(config, handle.handleEvent);
  return handle;
}

export async function sendQQLifecycleNotice(
  message: string,
): Promise<void> {
  const chatId = getActiveChatId("qq");
  if (!chatId) return;
  await sendQQNotice(chatId, message);
}

export async function stopQQChannel(handle: QQChannelHandle | null) {
  handle?.stop();
  await stopQQ();
}
