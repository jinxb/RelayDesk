import { randomBytes } from "node:crypto";
import { createLogger } from "../../../state/src/index.js";
import { weWorkRuntime } from "./runtime.js";
import {
  WeWorkCommand,
  type WeWorkHttpResponseBody,
  type WeWorkRequest,
  type WeWorkResponseMessage,
} from "./types.js";

const log = createLogger("WeWork");

function generateReqId() {
  return `${Date.now()}-${randomBytes(8).toString("hex")}`;
}

function sendJson(message: unknown, action: string) {
  if (!weWorkRuntime.ws || weWorkRuntime.connectionState !== "connected") {
    log.error(`Cannot ${action}: WebSocket not connected`);
    return;
  }

  try {
    weWorkRuntime.ws.send(JSON.stringify(message));
  } catch (error) {
    log.error(`Error sending ${action}:`, error);
  }
}

export function buildSubscribeMessage(secret: string, botId: string): WeWorkRequest {
  return {
    cmd: WeWorkCommand.SUBSCRIBE,
    headers: { req_id: generateReqId() },
    body: {
      secret,
      bot_id: botId,
    },
  };
}

export function buildPingMessage(): WeWorkRequest {
  return {
    cmd: WeWorkCommand.PING,
    headers: { req_id: generateReqId() },
    body: {},
  };
}

export function getConnectionState() {
  return weWorkRuntime.connectionState;
}

export function sendProactiveMessage(chatId: string, content: string) {
  if (!chatId) {
    log.error("Cannot send proactive message: chatId is required");
    return;
  }

  sendJson(
    {
      cmd: WeWorkCommand.AIBOT_SEND_MSG,
      headers: { req_id: generateReqId() },
      body: {
        chatid: chatId,
        chat_type: 1,
        msgtype: "markdown",
        markdown: { content },
      },
    },
    "proactive message",
  );
  log.info(`[WeWork] Sent aibot_send_msg to ${chatId}`);
}

export function sendWebSocketReply(reqId: string, body: WeWorkHttpResponseBody) {
  if (!reqId) {
    log.error("Cannot send reply: req_id is required");
    return;
  }

  sendJson(
    {
      cmd: WeWorkCommand.AIBOT_RESPOND_MSG,
      headers: { req_id: reqId },
      body,
    },
    "WebSocket reply",
  );
  log.debug(`[WeWork] Sent aibot_respond_msg: msgtype=${body.msgtype}`);
}

export function sendMessage(message: WeWorkResponseMessage) {
  sendJson(message, "message");
  log.info(`[WeWork] Sent message: ${message.cmd}, msgtype=${message.body.msgtype}`);
}

export function sendText(reqId: string, content: string) {
  const streamId = generateReqId();
  sendWebSocketReply(reqId, {
    msgtype: "stream",
    stream: { id: streamId, finish: true, content },
  });
}

export function sendStream(
  reqId: string,
  streamId: string,
  content: string,
  finish: boolean,
) {
  sendWebSocketReply(reqId, {
    msgtype: "stream",
    stream: { id: streamId, finish, content },
  });
}

export function sendStreamWithItems(
  reqId: string,
  streamId: string,
  content: string,
  finish: boolean,
  msgItem: NonNullable<WeWorkHttpResponseBody["stream"]>["msg_item"],
) {
  sendWebSocketReply(reqId, {
    msgtype: "stream",
    stream: { id: streamId, finish, content, msg_item: msgItem },
  });
}
