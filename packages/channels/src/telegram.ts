import type { Config } from "../../state/src/index.js";
import { initTelegram, stopTelegram } from "./telegram/client.js";
import { setupTelegramHandlers } from "./telegram/event-handler.js";
import { sendTextReply as sendTelegramNotice } from "./telegram/message-sender.js";
import { getActiveChatId, getActiveRouteAnchor, SessionManager } from "../../state/src/index.js";
import type { ChannelRuntimeServices } from "./runtime-services.js";

export type TelegramChannelHandle = ReturnType<typeof setupTelegramHandlers>;

export async function startTelegramChannel(
  config: Config,
  sessions: SessionManager,
  services: ChannelRuntimeServices = {},
): Promise<TelegramChannelHandle> {
  let handle: TelegramChannelHandle | null = null;
  await initTelegram(config, (bot) => {
    handle = setupTelegramHandlers(bot, config, sessions, services);
  });

  if (!handle) {
    throw new Error("Telegram handlers were not initialized.");
  }

  return handle;
}

export async function sendTelegramLifecycleNotice(
  message: string,
): Promise<void> {
  const chatId = getActiveChatId("telegram");
  if (!chatId) return;
  await sendTelegramNotice(chatId, message);
}

export function resolveTelegramWorkspace(
  sessions: SessionManager,
): string | undefined {
  const active = getActiveRouteAnchor("telegram");
  return active
    ? sessions.getWorkDirForRoute("telegram", active.chatId, active.userId)
    : undefined;
}

export function stopTelegramChannel(handle: TelegramChannelHandle | null): void {
  handle?.stop();
  stopTelegram();
}
