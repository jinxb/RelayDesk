import type { WebSocket } from "ws";
import type {
  WeWorkCallbackMessage,
  WeWorkConnectionState,
  WeWorkResponse,
} from "./types.js";

export const DEFAULT_WS_URL = "wss://openws.work.weixin.qq.com";
export const HEARTBEAT_INTERVAL = 30000;
export const MAX_RECONNECT_ATTEMPTS = 100;
export const CONNECT_TIMEOUT_MS = 15_000;
export const SUBSCRIBE_ACK_TIMEOUT_MS = 15_000;
export const WATCHDOG_INTERVAL_MS = 10_000;
export const CONNECT_GRACE_MS = 30_000;

export interface WeWorkRuntimeConfig {
  botId: string;
  secret: string;
  websocketUrl: string;
}

export const weWorkRuntime = {
  ws: null as WebSocket | null,
  connectionState: "disconnected" as WeWorkConnectionState,
  reconnectTimer: null as ReturnType<typeof setTimeout> | null,
  heartbeatTimer: null as ReturnType<typeof setInterval> | null,
  connectTimer: null as ReturnType<typeof setTimeout> | null,
  subscribeAckTimer: null as ReturnType<typeof setTimeout> | null,
  watchdogTimer: null as ReturnType<typeof setInterval> | null,
  reconnectAttempts: 0,
  shouldReconnect: false,
  isStopping: false,
  lastOpenAt: null as number | null,
  messageHandler: null as ((data: WeWorkCallbackMessage) => Promise<void>) | null,
  stateChangeHandler: null as ((state: WeWorkConnectionState) => void) | null,
  config: null as WeWorkRuntimeConfig | null,
  subscribeAckResolve: null as (() => void) | null,
  subscribeAckReject: null as ((err: Error) => void) | null,
  pendingResponses: new Map<string, {
    resolve: (response: WeWorkResponse) => void;
    reject: (err: Error) => void;
  }>(),
};

export function updateWeWorkState(
  state: WeWorkConnectionState,
  log: { debug: (message: string, ...args: unknown[]) => void },
) {
  weWorkRuntime.connectionState = state;
  weWorkRuntime.stateChangeHandler?.(state);
  log.debug("Connection state:", state);
}

export function clearReconnectTimer() {
  if (!weWorkRuntime.reconnectTimer) return;
  clearTimeout(weWorkRuntime.reconnectTimer);
  weWorkRuntime.reconnectTimer = null;
}

export function clearHeartbeatTimer() {
  if (!weWorkRuntime.heartbeatTimer) return;
  clearInterval(weWorkRuntime.heartbeatTimer);
  weWorkRuntime.heartbeatTimer = null;
}

export function clearConnectTimer() {
  if (!weWorkRuntime.connectTimer) return;
  clearTimeout(weWorkRuntime.connectTimer);
  weWorkRuntime.connectTimer = null;
}

export function clearSubscribeAckTimer() {
  if (!weWorkRuntime.subscribeAckTimer) return;
  clearTimeout(weWorkRuntime.subscribeAckTimer);
  weWorkRuntime.subscribeAckTimer = null;
}

export function clearWatchdogTimer() {
  if (!weWorkRuntime.watchdogTimer) return;
  clearInterval(weWorkRuntime.watchdogTimer);
  weWorkRuntime.watchdogTimer = null;
}

export function setSubscribeAckCallbacks(
  onSuccess: () => void,
  onError: (err: Error) => void,
) {
  weWorkRuntime.subscribeAckResolve = onSuccess;
  weWorkRuntime.subscribeAckReject = onError;
}

export function consumeSubscribeAckCallbacks() {
  const resolve = weWorkRuntime.subscribeAckResolve;
  const reject = weWorkRuntime.subscribeAckReject;
  weWorkRuntime.subscribeAckResolve = null;
  weWorkRuntime.subscribeAckReject = null;
  return { resolve, reject };
}

export function registerPendingResponse(
  reqId: string,
  resolve: (response: WeWorkResponse) => void,
  reject: (err: Error) => void,
) {
  weWorkRuntime.pendingResponses.set(reqId, { resolve, reject });
}

export function consumePendingResponse(reqId: string) {
  const pending = weWorkRuntime.pendingResponses.get(reqId) ?? null;
  if (pending) {
    weWorkRuntime.pendingResponses.delete(reqId);
  }
  return pending;
}

export function rejectPendingResponses(error: Error) {
  for (const pending of weWorkRuntime.pendingResponses.values()) {
    pending.reject(error);
  }
  weWorkRuntime.pendingResponses.clear();
}
