import { Client, WSClient, EventDispatcher, LoggerLevel } from '@larksuiteoapi/node-sdk';
import { createLogger, type Config } from '../../../state/src/index.js';
import {
  flushFeishuMessageDedupe,
  isDuplicateFeishuMessage,
} from "./dedupe-store.js";

const log = createLogger('Feishu');
const MESSAGE_EXPIRE_TTL_MS = 30 * 60 * 1000;
const WATCHDOG_INTERVAL_MS = 10_000;
const CONNECT_GRACE_MS = 30_000;
const MIN_RECONNECT_INTERVAL_MS = 10_000;

let client: Client | null = null;
let wsClient: WSClient | null = null;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let connectStartedAt = 0;
let lastOpenAt: number | null = null;
let lastReconnectAt = 0;

type FeishuWsInstance = {
  readyState?: number;
  terminate?: () => void;
};

type FeishuWsClientInternal = {
  wsConfig?: { getWSInstance?: () => FeishuWsInstance | null };
  reConnect?: (isStart?: boolean) => void;
  close?: () => void;
  stop?: () => void;
};

export function getClient(): Client {
  if (!client) throw new Error('Feishu client not initialized');
  return client;
}

function isExpiredMessage(createTimeMs?: string): boolean {
  if (!createTimeMs) {
    return false;
  }
  const createTime = Number.parseInt(createTimeMs, 10);
  if (Number.isNaN(createTime)) {
    return false;
  }
  return Date.now() - createTime > MESSAGE_EXPIRE_TTL_MS;
}

function extractInboundMessageMeta(data: unknown): { messageId: string; createTime?: string } {
  const raw = data as Record<string, unknown>;
  const event = (raw?.event ?? raw) as {
    message?: {
      message_id?: string;
      create_time?: string;
    };
  };
  return {
    messageId: event.message?.message_id ?? "",
    createTime: event.message?.create_time,
  };
}

function clearWatchdog(): void {
  if (!watchdogTimer) {
    return;
  }
  clearInterval(watchdogTimer);
  watchdogTimer = null;
}

function getWsInstance(clientValue: FeishuWsClientInternal): FeishuWsInstance | null {
  return clientValue.wsConfig?.getWSInstance?.() ?? null;
}

function forceReconnect(clientValue: FeishuWsClientInternal, reason: string): void {
  const now = Date.now();
  if (now - lastReconnectAt < MIN_RECONNECT_INTERVAL_MS) {
    return;
  }
  lastReconnectAt = now;
  log.warn(`[gateway] forcing reconnect: ${reason}`);
  try {
    if (typeof clientValue.reConnect === "function") {
      clientValue.reConnect(true);
      return;
    }
    getWsInstance(clientValue)?.terminate?.();
  } catch (error) {
    log.error("[gateway] failed to force reconnect:", error);
  }
}

function startWatchdog(clientValue: FeishuWsClientInternal): void {
  clearWatchdog();
  connectStartedAt = Date.now();
  lastOpenAt = null;
  watchdogTimer = setInterval(() => {
    const readyState = getWsInstance(clientValue)?.readyState;
    if (readyState === 1) {
      lastOpenAt = Date.now();
      return;
    }

    const lastSeen = lastOpenAt ?? connectStartedAt;
    if (Date.now() - lastSeen > CONNECT_GRACE_MS) {
      forceReconnect(clientValue, "ws not open");
      connectStartedAt = Date.now();
      lastOpenAt = null;
    }
  }, WATCHDOG_INTERVAL_MS);
}

function createInboundEventHandler(
  eventHandler: (data: unknown) => Promise<void | Record<string, unknown>>,
) {
  return async (data: unknown) => {
    const { messageId, createTime } = extractInboundMessageMeta(data);
    if (isDuplicateFeishuMessage(messageId)) {
      log.info(`[EVENT] Skipping duplicate Feishu message: ${messageId}`);
      return {};
    }
    if (isExpiredMessage(createTime)) {
      log.info(`[EVENT] Skipping stale Feishu message: ${messageId}`);
      return {};
    }
    log.info('[EVENT] Received Feishu message event');
    log.info('[EVENT] Event data:', JSON.stringify(data).slice(0, 500));
    try {
      await eventHandler(data);
      log.info('[EVENT] Event handler called successfully');
    } catch (err) {
      log.error('[EVENT] Error calling event handler:', err);
    }
  };
}

function createCardActionHandler(
  eventHandler: (data: unknown) => Promise<void | Record<string, unknown>>,
) {
  return async (data: unknown) => {
    log.info('[EVENT] Received Feishu card action event');
    log.info('[EVENT] Card action data:', JSON.stringify(data).slice(0, 800));
    try {
      return await eventHandler(data);
    } catch (err) {
      log.error('[EVENT] Error handling card action:', err);
      return { toast: { type: 'error', content: '处理失败' } };
    }
  };
}

function createEventDispatcher(
  eventHandler: (data: unknown) => Promise<void | Record<string, unknown>>,
) {
  const eventDispatcher = new EventDispatcher({});
  eventDispatcher.register({
    'im.message.receive_v1': createInboundEventHandler(eventHandler),
    'card.action.trigger': createCardActionHandler(eventHandler),
  });
  eventDispatcher.register({
    '*': (data: unknown) => {
      log.info('Received Feishu event (catch-all):', JSON.stringify(data).slice(0, 500));
    },
  });
  return eventDispatcher;
}

function createFeishuWsClient(config: Config): WSClient {
  return new WSClient({
    appId: config.feishuAppId,
    appSecret: config.feishuAppSecret,
    loggerLevel: LoggerLevel.info,
  });
}

export async function initFeishu(
  config: Config,
  eventHandler: (data: unknown) => Promise<void | Record<string, unknown>>
): Promise<void> {
  if (!config.feishuAppId || !config.feishuAppSecret) {
    throw new Error('Feishu app_id and app_secret are required');
  }

  client = new Client({
    appId: config.feishuAppId,
    appSecret: config.feishuAppSecret,
    loggerLevel: LoggerLevel.info,
    disableTokenCache: false,
  });
  const eventDispatcher = createEventDispatcher(eventHandler);
  wsClient = createFeishuWsClient(config);

  try {
    await wsClient.start({ eventDispatcher });
    startWatchdog(wsClient as unknown as FeishuWsClientInternal);
    log.info('Feishu WebSocket started');
  } catch (err) {
    log.error('Failed to start Feishu WebSocket:', err);
    throw err;
  }

  log.info('Feishu client initialized');
}

export function stopFeishu(): void {
  clearWatchdog();
  if (wsClient) {
    const wsClientInternal = wsClient as unknown as FeishuWsClientInternal;
    if (typeof wsClientInternal.close === "function") {
      wsClientInternal.close();
    } else if (typeof wsClientInternal.stop === "function") {
      wsClientInternal.stop();
    }
    wsClient = null;
    log.info('Feishu WebSocket closed');
  }
  flushFeishuMessageDedupe();
  connectStartedAt = 0;
  lastOpenAt = null;
  lastReconnectAt = 0;
  client = null;
}
