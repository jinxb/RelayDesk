import { Telegraf } from "telegraf";
import { createLogger, type Config } from "../../../state/src/index.js";

const log = createLogger("Telegram");
const TELEGRAM_GET_ME_TIMEOUT_MS = 5000;
const TELEGRAM_LAUNCH_GRACE_MS = 1500;

let bot: Telegraf;
let botUsername: string | undefined;

export function getBot(): Telegraf {
  if (!bot) throw new Error("Telegram bot not initialized");
  return bot;
}

export function getBotUsername(): string | undefined {
  return botUsername;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return Promise.race([
    task,
    delay(timeoutMs).then(() => {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }),
  ]);
}

export async function initTelegram(
  config: Config,
  setupHandlers: (bot: Telegraf) => void,
): Promise<void> {
  const token = config.telegramBotToken ?? "";
  if (!token) {
    throw new Error("Telegram bot token is required");
  }
  bot = new Telegraf(token);
  setupHandlers(bot);
  const me = (await withTimeout(
    bot.telegram.getMe() as Promise<{ username?: string }>,
    TELEGRAM_GET_ME_TIMEOUT_MS,
    "Telegram getMe",
  )) as { username?: string };
  botUsername = me.username;
  let startupWindowOpen = true;
  const launchPromise = bot.launch();
  void launchPromise.catch((error) => {
    if (startupWindowOpen) {
      return;
    }
    log.error("Telegram polling runtime error:", error);
  });

  try {
    await Promise.race([
      launchPromise,
      new Promise<void>((resolve) => {
        setTimeout(resolve, TELEGRAM_LAUNCH_GRACE_MS);
      }),
    ]);
  } catch (error) {
    log.error("Telegram polling startup failed:", error);
    throw error;
  } finally {
    startupWindowOpen = false;
  }
  log.info("Telegram bot launched");
}

export function stopTelegram(): void {
  bot?.stop("SIGTERM");
}
