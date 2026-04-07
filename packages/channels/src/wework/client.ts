/**
 * WeWork (企业微信/WeCom) Client
 * 基于企业微信官方 AI_BOT WebSocket 协议
 */

import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createLogger, type Config } from "../../../state/src/index.js";
import {
  getConnectionState,
  sendMessage,
  sendProactiveMessage,
  sendStream,
  sendStreamWithItems,
  sendText,
  sendWebSocketReply,
} from "./protocol.js";
import { connectWeWorkSocket, stopWeWorkSocket } from "./socket.js";
import {
  DEFAULT_WS_URL,
  consumePendingResponse,
  registerPendingResponse,
  weWorkRuntime,
} from "./runtime.js";
import type {
  WeWorkCallbackMessage,
  WeWorkConnectionState,
  WeWorkRequest,
  WeWorkResponse,
} from "./types.js";

const log = createLogger("WeWork");

export { getConnectionState, sendProactiveMessage, sendWebSocketReply, sendMessage, sendText, sendStream, sendStreamWithItems };

function createReqId() {
  return `${Date.now()}-${randomBytes(8).toString("hex")}`;
}

function sendWeWorkRequest(frame: WeWorkRequest): Promise<WeWorkResponse> {
  if (!weWorkRuntime.ws || weWorkRuntime.connectionState !== "connected") {
    throw new Error("WeWork WebSocket is not connected");
  }

  const reqId = String(frame.headers?.req_id ?? "").trim();
  if (!reqId) {
    throw new Error("WeWork request requires req_id");
  }

  return new Promise<WeWorkResponse>((resolve, reject) => {
    registerPendingResponse(reqId, resolve, reject);
    try {
      weWorkRuntime.ws?.send(JSON.stringify(frame));
    } catch (error) {
      consumePendingResponse(reqId);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export async function uploadWeWorkMedia(
  filePath: string,
  mediaType: "file" | "image" | "voice" | "video",
  filename?: string,
): Promise<{ mediaId: string; createdAt?: number }> {
  const sourcePath = filePath.trim();
  if (!sourcePath) {
    throw new Error("WeWork media upload requires a local file path");
  }

  const fileBuffer = await readFile(sourcePath);
  const resolvedName = filename?.trim() || sourcePath.split(/[\\/]/).pop() || "file.bin";
  const md5 = createHash("md5").update(fileBuffer).digest("hex");

  const initFrame = await sendWeWorkRequest({
    cmd: "aibot_upload_media_init",
    headers: { req_id: createReqId() },
    body: {
      type: mediaType,
      filename: resolvedName,
      total_size: fileBuffer.length,
      total_chunks: 1,
      md5,
    },
  });

  const uploadId =
    String((initFrame.body as { upload_id?: string } | undefined)?.upload_id ?? "").trim() ||
    `upload-${createReqId()}`;

  await sendWeWorkRequest({
    cmd: "aibot_upload_media_chunk",
    headers: { req_id: createReqId() },
    body: {
      upload_id: uploadId,
      chunk_index: 0,
      total_chunks: 1,
      data: fileBuffer.toString("base64"),
    },
  });

  const finishFrame = await sendWeWorkRequest({
    cmd: "aibot_upload_media_finish",
    headers: { req_id: createReqId() },
    body: {
      upload_id: uploadId,
      md5,
    },
  });

  const body = (finishFrame.body as { media_id?: string; created_at?: number } | undefined) ?? {};
  const mediaId = String(body.media_id ?? "").trim();
  if (!mediaId) {
    throw new Error(`WeWork upload returned empty media_id for ${resolvedName}`);
  }
  return {
    mediaId,
    createdAt: typeof body.created_at === "number" ? body.created_at : undefined,
  };
}

export async function initWeWork(
  cfg: Config,
  eventHandler: (data: WeWorkCallbackMessage) => Promise<void>,
  onStateChange?: (state: WeWorkConnectionState) => void,
) {
  if (!cfg.weworkCorpId || !cfg.weworkSecret) {
    throw new Error("WeWork botId and secret are required");
  }

  weWorkRuntime.config = {
    botId: cfg.weworkCorpId,
    secret: cfg.weworkSecret,
    websocketUrl: cfg.weworkWsUrl || DEFAULT_WS_URL,
  };
  weWorkRuntime.messageHandler = eventHandler;
  weWorkRuntime.stateChangeHandler = onStateChange ?? null;
  weWorkRuntime.isStopping = false;
  weWorkRuntime.shouldReconnect = false;

  log.info(`Initializing WeWork client (botId: ${weWorkRuntime.config.botId})`);
  const maxAttempts = 3;
  const retryDelayMs = 1500;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await connectWeWorkSocket();
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxAttempts) {
        log.warn(
          `WeWork connection attempt ${attempt}/${maxAttempts} failed (${lastError.message}), retrying in ${retryDelayMs}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  throw lastError ?? new Error("WeWork connection failed");
}

export function stopWeWork() {
  stopWeWorkSocket();
}
