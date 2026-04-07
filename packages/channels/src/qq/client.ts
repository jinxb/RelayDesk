import WebSocket from "ws";
import { createLogger, type Config } from "../../../state/src/index.js";
import type { QQAttachment, QQMessageEvent } from "./types.js";
import {
  clearQQApiCaches,
  fetchQQAccessToken,
  getQQGatewayUrl,
  sendQQChannelTextMessage,
  sendQQGroupFileMessage,
  sendQQGroupImageMessage,
  sendQQGroupTextMessage,
  sendQQPrivateFileMessage,
  sendQQPrivateImageMessage,
  sendQQPrivateTypingNotice,
  sendQQPrivateTextMessage,
} from "./api.js";

const log = createLogger("QQ");

const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];
const INTENTS = {
  PUBLIC_GUILD_MESSAGES: 1 << 30,
  DIRECT_MESSAGE: 1 << 12,
  GROUP_AND_C2C: 1 << 25,
};

interface GatewayPayload {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string;
}

type QQLifecycleEventType =
  | "friend_add"
  | "friend_del"
  | "group_add_robot"
  | "group_del_robot"
  | "c2c_msg_receive"
  | "c2c_msg_reject"
  | "group_msg_receive"
  | "group_msg_reject";

interface QQMessageEnvelope {
  kind: "message";
  event: QQMessageEvent;
}

interface QQLifecycleEvent {
  kind: "lifecycle";
  type: QQLifecycleEventType;
  userOpenid?: string;
  groupOpenid?: string;
  raw: Record<string, unknown>;
}

type QQNormalizedEvent = QQMessageEnvelope | QQLifecycleEvent;

interface QQClient {
  sendPrivateMessage(openid: string, content: string, replyToMessageId?: string): Promise<string | undefined>;
  sendGroupMessage(groupOpenid: string, content: string, replyToMessageId?: string): Promise<string | undefined>;
  sendChannelMessage(channelId: string, content: string, replyToMessageId?: string): Promise<string | undefined>;
  sendPrivateImage(openid: string, imagePath: string): Promise<string | undefined>;
  sendGroupImage(groupOpenid: string, imagePath: string): Promise<string | undefined>;
  sendPrivateFile(openid: string, filePath: string): Promise<string | undefined>;
  sendGroupFile(groupOpenid: string, filePath: string): Promise<string | undefined>;
  sendPrivateTyping(openid: string, replyToMessageId: string): Promise<void>;
}

let client: QQClient | null = null;
let ws: WebSocket | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;
let seq: number | null = null;
let sessionId: string | null = null;
let reconnectAttempt = 0;
let currentConfig: Config | null = null;
let currentHandler: ((event: QQMessageEvent) => Promise<void>) | null = null;

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function resolveQQUserOpenid(data: Record<string, unknown>): string {
  const author = asRecord(data.author);
  return (
    textValue(author.user_openid) ||
    textValue(author.member_openid) ||
    textValue(data.user_openid) ||
    textValue(data.openid) ||
    textValue(author.id)
  );
}

function resolveQQGroupOpenid(data: Record<string, unknown>): string {
  return textValue(data.group_openid) || textValue(data.group_id);
}

function lifecycleEventType(eventType: string): QQLifecycleEventType | null {
  if (eventType === "FRIEND_ADD") return "friend_add";
  if (eventType === "FRIEND_DEL") return "friend_del";
  if (eventType === "GROUP_ADD_ROBOT") return "group_add_robot";
  if (eventType === "GROUP_DEL_ROBOT") return "group_del_robot";
  if (eventType === "C2C_MSG_RECEIVE") return "c2c_msg_receive";
  if (eventType === "C2C_MSG_REJECT") return "c2c_msg_reject";
  if (eventType === "GROUP_MSG_RECEIVE") return "group_msg_receive";
  if (eventType === "GROUP_MSG_REJECT") return "group_msg_reject";
  return null;
}

function logLifecycleEvent(event: QQLifecycleEvent): void {
  const target = event.groupOpenid || event.userOpenid || "unknown";
  if (
    event.type === "friend_add" ||
    event.type === "group_add_robot" ||
    event.type === "c2c_msg_receive" ||
    event.type === "group_msg_receive"
  ) {
    log.info(`QQ lifecycle event received: ${event.type}, target=${target}`);
    return;
  }

  log.warn(
    `QQ lifecycle event indicates message delivery is unavailable: ${event.type}, target=${target}`,
  );
}

function clearTimers(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

export function normalizeInboundEvent(payload: GatewayPayload): QQNormalizedEvent | null {
  const type = payload.t;
  const data = asRecord(payload.d);
  const attachments = Array.isArray(data.attachments)
    ? data.attachments.map((attachment): QQAttachment => ({
        url: typeof attachment?.url === "string" ? attachment.url : undefined,
        filename: typeof attachment?.filename === "string" ? attachment.filename : undefined,
        contentType: typeof attachment?.content_type === "string" ? attachment.content_type : undefined,
        size: typeof attachment?.size === "number" ? attachment.size : undefined,
        width: typeof attachment?.width === "number" ? attachment.width : undefined,
        height: typeof attachment?.height === "number" ? attachment.height : undefined,
        raw: attachment as Record<string, unknown>,
      }))
    : undefined;
  const baseEvent = {
    id: textValue(data.id),
    content: textValue(data.content),
    attachments,
    raw: data,
  };

  if (type === "C2C_MESSAGE_CREATE" || type === "C2C_MSG_RECEIVE") {
    return {
      kind: "message",
      event: {
        type: "private",
        ...baseEvent,
        userOpenid: resolveQQUserOpenid(data),
      },
    };
  }

  if (type === "GROUP_AT_MESSAGE_CREATE" || type === "GROUP_MSG_RECEIVE") {
    return {
      kind: "message",
      event: {
        type: "group",
        ...baseEvent,
        userOpenid: resolveQQUserOpenid(data),
        groupOpenid: resolveQQGroupOpenid(data),
      },
    };
  }

  if (type === "AT_MESSAGE_CREATE" || type === "DIRECT_MESSAGE_CREATE") {
    return {
      kind: "message",
      event: {
        type: "channel",
        ...baseEvent,
        userOpenid: textValue(asRecord(data.author).id),
        channelId: textValue(data.channel_id),
      },
    };
  }

  const nextLifecycleType = lifecycleEventType(type ?? "");
  if (nextLifecycleType) {
    return {
      kind: "lifecycle",
      type: nextLifecycleType,
      userOpenid: resolveQQUserOpenid(data),
      groupOpenid: resolveQQGroupOpenid(data),
      raw: data,
    };
  }

  return null;
}

function startHeartbeat(intervalMs: number): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ op: 1, d: seq }));
  }, intervalMs);
}

async function connectWebSocket(config: Config, handler: (event: QQMessageEvent) => Promise<void>): Promise<void> {
  const gatewayUrl = await getQQGatewayUrl(config);
  const token = await fetchQQAccessToken(config);

  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(gatewayUrl);
    ws = socket;
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    socket.on("open", () => {
      log.info("QQ gateway connected");
      reconnectAttempt = 0;
    });

    socket.on("message", async (raw) => {
      try {
        const payload = JSON.parse(raw.toString()) as GatewayPayload;
        if (typeof payload.s === "number") seq = payload.s;

        if (payload.op === 10) {
          const heartbeatInterval = Number((payload.d as { heartbeat_interval?: number })?.heartbeat_interval ?? 30000);
          startHeartbeat(heartbeatInterval);
          socket.send(
            JSON.stringify({
              op: sessionId ? 6 : 2,
              d: sessionId
                ? {
                    token: `QQBot ${token}`,
                    session_id: sessionId,
                    seq,
                  }
                : {
                    token: `QQBot ${token}`,
                    intents:
                      INTENTS.GROUP_AND_C2C |
                      INTENTS.DIRECT_MESSAGE |
                      INTENTS.PUBLIC_GUILD_MESSAGES,
                    shard: [0, 1],
                    properties: {
                      os: process.platform,
                      browser: "relaydesk",
                      device: "relaydesk",
                    },
                  },
            }),
          );
          return;
        }

        if (payload.op === 0 && payload.t === "READY") {
          sessionId = String((payload.d as { session_id?: string })?.session_id ?? "");
          log.info(`QQ gateway READY, session=${sessionId || "unknown"}`);
          settle(resolve);
          return;
        }

        if (payload.op === 0 && payload.t === "RESUMED") {
          log.info("QQ gateway RESUMED");
          settle(resolve);
          return;
        }

        const normalized = normalizeInboundEvent(payload);
        if (!normalized) {
          return;
        }

        if (normalized.kind === "lifecycle") {
          logLifecycleEvent(normalized);
          return;
        }

        const event = normalized.event;
        if (event.content || (event.attachments?.length ?? 0) > 0) {
          await handler(event);
        }
      } catch (error) {
        log.error("Failed to handle QQ gateway payload:", error);
      }
    });

    socket.on("error", (error) => {
      log.error("QQ gateway error:", error);
      settle(() => reject(error));
    });

    socket.on("close", (code, reason) => {
      clearTimers();
      ws = null;
      log.info(`QQ gateway closed: ${code} ${reason.toString()}`);
      if (stopped) return;
      if (code === 4004 || code === 4006 || code === 4007 || code === 4009) {
        clearQQApiCaches();
        sessionId = null;
        seq = null;
      }
      const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => {
        if (currentConfig && currentHandler) {
          log.info("QQ gateway reconnecting");
          connectWebSocket(currentConfig, currentHandler).catch((err) => {
            log.error("QQ reconnect failed:", err);
          });
        }
      }, delay);
    });

    setTimeout(() => {
      settle(() => reject(new Error("QQ gateway ready timeout")));
    }, 15000);
  });
}

export function getQQBot(): QQClient {
  if (!client || !currentConfig) {
    throw new Error("QQ bot is not initialized");
  }
  return client;
}

export async function initQQ(
  config: Config,
  eventHandler: (event: QQMessageEvent) => Promise<void>,
): Promise<void> {
  if (!config.qqAppId || !config.qqSecret) {
    throw new Error("QQ Bot App ID and Secret are required");
  }

  stopped = false;
  currentConfig = config;
  currentHandler = eventHandler;
  client = {
    sendPrivateMessage: (openid, content, replyToMessageId) =>
      sendQQPrivateTextMessage(config, openid, content, replyToMessageId),
    sendGroupMessage: (groupOpenid, content, replyToMessageId) =>
      sendQQGroupTextMessage(config, groupOpenid, content, replyToMessageId),
    sendChannelMessage: (channelId, content, replyToMessageId) =>
      sendQQChannelTextMessage(config, channelId, content, replyToMessageId),
    sendPrivateImage: (openid, imagePath) =>
      sendQQPrivateImageMessage(config, openid, imagePath),
    sendGroupImage: (groupOpenid, imagePath) =>
      sendQQGroupImageMessage(config, groupOpenid, imagePath),
    sendPrivateFile: (openid, filePath) =>
      sendQQPrivateFileMessage(config, openid, filePath),
    sendGroupFile: (groupOpenid, filePath) =>
      sendQQGroupFileMessage(config, groupOpenid, filePath),
    sendPrivateTyping: (openid, replyToMessageId) =>
      sendQQPrivateTypingNotice(config, openid, replyToMessageId),
  };

  await connectWebSocket(config, eventHandler);
  log.info("QQ bot initialized");
}

export async function stopQQ(): Promise<void> {
  stopped = true;
  clearTimers();
  if (ws) {
    ws.close(1000);
    ws = null;
  }
  client = null;
  currentConfig = null;
  currentHandler = null;
  clearQQApiCaches();
  sessionId = null;
  seq = null;
}
