import { createLogger, getActiveChatId, type Config, type SessionManager } from "../../state/src/index.js";
import { initWeChat, stopWeChat } from "./wechat/client.js";
import { setupWeChatHandlers } from "./wechat/event-handler.js";
import { sendTextReply as sendWeChatNotice } from "./wechat/message-sender.js";
import type { ChannelRuntimeServices } from "./runtime-services.js";

export type WeChatChannelHandle = ReturnType<typeof setupWeChatHandlers>;

const log = createLogger("WeChat");

export async function startWeChatChannel(
  config: Config,
  sessions: SessionManager,
  services: ChannelRuntimeServices = {},
): Promise<WeChatChannelHandle> {
  const handle = setupWeChatHandlers(config, sessions, services);
  try {
    await initWeChat(config, handle.handleEvent);
    return handle;
  } catch (error) {
    handle.stop();
    throw error;
  }
}

export async function sendWeChatLifecycleNotice(
  message: string,
): Promise<void> {
  const chatId = getActiveChatId("wechat");
  if (!chatId) return;
  await sendWeChatNotice(chatId, message);
  log.info(`WeChat lifecycle notice sent to ${chatId}`);
}

export function stopWeChatChannel(handle: WeChatChannelHandle | null): void {
  handle?.stop();
  stopWeChat();
}
