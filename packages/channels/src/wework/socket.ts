import { WebSocket } from "ws";
import { createLogger } from "../../../state/src/index.js";
import {
  buildPingMessage,
  buildSubscribeMessage,
} from "./protocol.js";
import {
  clearConnectTimer,
  clearHeartbeatTimer,
  clearReconnectTimer,
  clearSubscribeAckTimer,
  clearWatchdogTimer,
  CONNECT_GRACE_MS,
  CONNECT_TIMEOUT_MS,
  consumePendingResponse,
  consumeSubscribeAckCallbacks,
  HEARTBEAT_INTERVAL,
  MAX_RECONNECT_ATTEMPTS,
  rejectPendingResponses,
  SUBSCRIBE_ACK_TIMEOUT_MS,
  setSubscribeAckCallbacks,
  updateWeWorkState,
  WATCHDOG_INTERVAL_MS,
  weWorkRuntime,
} from "./runtime.js";
import type {
  WeWorkCallbackMessage,
  WeWorkConnectionState,
  WeWorkResponse,
} from "./types.js";
import { clearWeWorkInboundDedupe } from "./inbound-dedupe.js";

const log = createLogger("WeWork");

async function handleMessage(message: WeWorkCallbackMessage | WeWorkResponse) {
  if ("errcode" in message) {
    const response = message as WeWorkResponse;
    if (weWorkRuntime.subscribeAckResolve || weWorkRuntime.subscribeAckReject) {
      const { resolve, reject } = consumeSubscribeAckCallbacks();
      clearSubscribeAckTimer();
      if (response.errcode === 0) {
        log.debug("Subscribe ack received");
        resolve?.();
      } else {
        log.error(`WeWork subscribe failed: ${response.errcode} - ${response.errmsg}`);
        reject?.(new Error(`Subscribe failed: ${response.errcode} ${response.errmsg}`));
      }
      return;
    }

    const reqId = String(response.headers?.req_id ?? "").trim();
    if (reqId) {
      const pending = consumePendingResponse(reqId);
      if (pending) {
        pending.resolve(response);
        return;
      }
    }

    if (response.errcode !== 0) {
      log.error(`WeWork error response: ${response.errcode} - ${response.errmsg}`);
    } else {
      log.debug("WeWork message sent successfully");
    }
    return;
  }

  if (message.cmd !== "aibot_msg_callback") {
    return;
  }

  const callback = message as WeWorkCallbackMessage;
  log.info(
    `[WeWork] Received message: msgtype=${callback.body.msgtype}, from=${callback.body.from.userid}, chatid=${callback.body.chatid}`,
  );

  if (!weWorkRuntime.messageHandler) {
    return;
  }

  try {
    await weWorkRuntime.messageHandler(callback);
  } catch (error) {
    log.error("Error in message handler:", error);
  }
}

function startWatchdog() {
  clearWatchdogTimer();
  weWorkRuntime.lastOpenAt = Date.now();
  weWorkRuntime.watchdogTimer = setInterval(() => {
    const ws = weWorkRuntime.ws;
    if (!ws) {
      return;
    }
    if (weWorkRuntime.connectionState === "connected" && ws.readyState === WebSocket.OPEN) {
      weWorkRuntime.lastOpenAt = Date.now();
      return;
    }
    const lastSeen = weWorkRuntime.lastOpenAt ?? Date.now();
    if (Date.now() - lastSeen <= CONNECT_GRACE_MS) {
      return;
    }
    log.warn("[WeWork] forcing reconnect: ws not open");
    try {
      ws.close();
    } catch (error) {
      log.error("Error closing stalled WeWork socket:", error);
    }
  }, WATCHDOG_INTERVAL_MS);
}

function startHeartbeat() {
  clearHeartbeatTimer();
  weWorkRuntime.heartbeatTimer = setInterval(() => {
    if (weWorkRuntime.connectionState !== "connected" || !weWorkRuntime.ws) {
      return;
    }

    try {
      weWorkRuntime.ws.send(JSON.stringify(buildPingMessage()));
      log.debug("Sent ping");
    } catch (error) {
      log.error("Error sending ping:", error);
    }
  }, HEARTBEAT_INTERVAL);
}

function scheduleReconnect() {
  if (weWorkRuntime.isStopping || !weWorkRuntime.shouldReconnect) return;
  if (weWorkRuntime.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    log.error("Max reconnect attempts reached");
    return;
  }
  if (weWorkRuntime.reconnectTimer) return;

  weWorkRuntime.reconnectTimer = setTimeout(async () => {
    weWorkRuntime.reconnectTimer = null;
    weWorkRuntime.reconnectAttempts += 1;
    log.info(
      `Reconnecting... Attempt ${weWorkRuntime.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`,
    );
    try {
      await connectWeWorkSocket();
    } catch (error) {
      log.error("Reconnection failed:", error);
    }
  }, 5000);
}

function sendSubscribeAndWaitAck(
  onSuccess: () => void,
  onError: (err: Error) => void,
) {
  const config = weWorkRuntime.config;
  const ws = weWorkRuntime.ws;
  if (!config || !ws) {
    throw new Error("WebSocket not connected");
  }

  setSubscribeAckCallbacks(onSuccess, onError);
  clearSubscribeAckTimer();
  weWorkRuntime.subscribeAckTimer = setTimeout(() => {
    const { reject } = consumeSubscribeAckCallbacks();
    clearSubscribeAckTimer();
    const error = new Error("WeWork subscribe acknowledgement timed out");
    log.error(error.message);
    reject?.(error);
  }, SUBSCRIBE_ACK_TIMEOUT_MS);
  ws.send(JSON.stringify(buildSubscribeMessage(config.secret, config.botId)));
  log.debug("Sent subscribe message, waiting for ack...");
}

export async function connectWeWorkSocket(): Promise<void> {
  if (weWorkRuntime.connectionState === "connecting") {
    log.warn("WebSocket connection already in progress");
    return;
  }

  if (!weWorkRuntime.config) {
    throw new Error("WeWork config not initialized");
  }

  if (weWorkRuntime.ws) {
    try {
      weWorkRuntime.ws.removeAllListeners();
      weWorkRuntime.ws.close();
    } catch {
      // ignore stale socket cleanup
    }
    weWorkRuntime.ws = null;
  }

  updateWeWorkState("connecting" as WeWorkConnectionState, log);
  const websocketUrl = weWorkRuntime.config.websocketUrl;

  return new Promise<void>((resolve, reject) => {
    try {
      const ws = new WebSocket(websocketUrl);
      weWorkRuntime.ws = ws;
      clearConnectTimer();
      weWorkRuntime.connectTimer = setTimeout(() => {
        const error = new Error("WeWork WebSocket connect timed out");
        log.error(error.message);
        updateWeWorkState("error", log);
        reject(error);
        try {
          ws.close();
        } catch {
          /* ignore close-on-timeout failures */
        }
      }, CONNECT_TIMEOUT_MS);

      ws.on("open", async () => {
        log.info("WeWork WebSocket connected");
        weWorkRuntime.reconnectAttempts = 0;
        clearConnectTimer();
        updateWeWorkState("connected", log);
        weWorkRuntime.lastOpenAt = Date.now();
        startHeartbeat();
        startWatchdog();

        try {
          sendSubscribeAndWaitAck(() => {
            weWorkRuntime.shouldReconnect = true;
            log.info("WeWork authentication successful");
            resolve();
          }, reject);
        } catch (error) {
          log.error("WeWork authentication failed:", error);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });

      ws.on("message", async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as WeWorkCallbackMessage | WeWorkResponse;
          weWorkRuntime.lastOpenAt = Date.now();
          await handleMessage(message);
        } catch (error) {
          log.error("Error parsing WebSocket message:", error);
        }
      });

      ws.on("error", (error) => {
        log.error("WeWork WebSocket error:", error);
        clearConnectTimer();
        clearSubscribeAckTimer();
        updateWeWorkState("error", log);
        reject(error);
      });

      ws.on("close", () => {
        log.info("WeWork WebSocket closed");
        clearConnectTimer();
        clearSubscribeAckTimer();
        clearHeartbeatTimer();
        clearWatchdogTimer();
        rejectPendingResponses(new Error("WeWork WebSocket closed"));
        updateWeWorkState("disconnected", log);
        if (!weWorkRuntime.isStopping && weWorkRuntime.shouldReconnect) {
          scheduleReconnect();
        }
      });
    } catch (error) {
      log.error("Error creating WebSocket connection:", error);
      updateWeWorkState("error", log);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export function stopWeWorkSocket() {
  weWorkRuntime.isStopping = true;
  weWorkRuntime.shouldReconnect = false;
  clearConnectTimer();
  clearSubscribeAckTimer();
  clearHeartbeatTimer();
  clearWatchdogTimer();
  clearReconnectTimer();
  if (weWorkRuntime.ws) {
    weWorkRuntime.ws.close();
    weWorkRuntime.ws = null;
  }
  rejectPendingResponses(new Error("WeWork client stopped"));
  clearWeWorkInboundDedupe();
  updateWeWorkState("disconnected", log);
  log.info("WeWork client stopped");
}
