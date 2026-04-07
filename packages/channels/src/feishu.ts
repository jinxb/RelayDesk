import type { Config } from "../../state/src/index.js";
import { initFeishu, stopFeishu } from "./feishu/client.js";
import { setupFeishuHandlers } from "./feishu/event-handler.js";
import { sendTextReply as sendFeishuNotice } from "./feishu/message-sender.js";
import { getActiveChatId, SessionManager } from "../../state/src/index.js";
import type { ChannelRuntimeServices } from "./runtime-services.js";

export type FeishuChannelHandle = ReturnType<typeof setupFeishuHandlers>;

export async function startFeishuChannel(
  config: Config,
  sessions: SessionManager,
  services: ChannelRuntimeServices = {},
): Promise<FeishuChannelHandle> {
  const handle = setupFeishuHandlers(config, sessions, services);
  await initFeishu(config, handle.handleEvent);
  return handle;
}

export async function sendFeishuLifecycleNotice(
  message: string,
): Promise<void> {
  const chatId = getActiveChatId("feishu");
  if (!chatId) return;
  await sendFeishuNotice(chatId, message);
}

export function stopFeishuChannel(handle: FeishuChannelHandle | null): void {
  handle?.stop();
  stopFeishu();
}
