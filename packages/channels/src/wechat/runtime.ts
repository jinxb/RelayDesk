import { createLogger } from "../../../state/src/index.js";
import {
  getWeChatConfig,
  getWeChatUpdates,
  type WeChatConfigResponse,
} from "./api.js";
import { normalizeWeChatApiMessage } from "./normalize.js";
import {
  loadWeChatContextTokens,
  loadWeChatSyncBuf,
  saveWeChatContextTokens,
  saveWeChatSyncBuf,
} from "./runtime-store.js";
import type { WeChatChannelState } from "./types.js";

const log = createLogger("WeChatRuntime");
const STARTUP_POLL_TIMEOUT_MS = 1_500;
const LONG_POLL_TIMEOUT_MS = 35_000;
const RETRY_DELAY_MS = 2_000;
const BACKOFF_DELAY_MS = 10_000;
const MAX_CONSECUTIVE_FAILURES = 3;

interface RuntimeConfig {
  readonly baseUrl: string;
  readonly token: string;
}

interface RuntimeState {
  state: WeChatChannelState;
  config: RuntimeConfig | null;
  syncBuf: string;
  abortController: AbortController | null;
  monitorTask: Promise<void> | null;
  eventHandler: ((data: unknown) => Promise<void>) | null;
  stateListener?: (state: WeChatChannelState) => void;
  contextTokens: Map<string, string>;
  typingTickets: Map<string, string>;
}

const runtime: RuntimeState = {
  state: "disconnected",
  config: null,
  syncBuf: "",
  abortController: null,
  monitorTask: null,
  eventHandler: null,
  contextTokens: new Map(),
  typingTickets: new Map(),
};

function setState(state: WeChatChannelState) {
  runtime.state = state;
  runtime.stateListener?.(state);
}

function currentConfig(): RuntimeConfig {
  if (!runtime.config) {
    throw new Error("WeChat runtime is not running.");
  }
  return runtime.config;
}

function rememberSyncBuf(syncBuf: string | undefined) {
  if (typeof syncBuf !== "string" || syncBuf.length === 0) {
    return;
  }
  runtime.syncBuf = syncBuf;
  saveWeChatSyncBuf(syncBuf);
}

async function dispatchInboundMessage(raw: unknown): Promise<void> {
  if (!runtime.eventHandler) {
    return;
  }
  await runtime.eventHandler(raw);
}

async function handlePollResponse(raw: Awaited<ReturnType<typeof getWeChatUpdates>>) {
  const isApiError =
    (typeof raw.ret === "number" && raw.ret !== 0)
    || (typeof raw.errcode === "number" && raw.errcode !== 0);
  if (isApiError) {
    throw new Error(raw.errmsg || `WeChat getupdates failed: ret=${raw.ret} errcode=${raw.errcode}`);
  }

  rememberSyncBuf(raw.get_updates_buf);
  for (const message of raw.msgs ?? []) {
    const normalized = normalizeWeChatApiMessage(message);
    if (!normalized) {
      continue;
    }
    if (normalized.context_token) {
      setWeChatContextToken(normalized.from_user_id, normalized.context_token);
    }
    await dispatchInboundMessage(normalized);
  }
}

async function pollOnce(timeoutMs: number, signal: AbortSignal): Promise<void> {
  const { baseUrl, token } = currentConfig();
  const response = await getWeChatUpdates({
    baseUrl,
    token,
    syncBuf: runtime.syncBuf,
    timeoutMs,
    signal,
  });
  await handlePollResponse(response);
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function monitorLoop(signal: AbortSignal): Promise<void> {
  let consecutiveFailures = 0;

  while (!signal.aborted) {
    try {
      await pollOnce(LONG_POLL_TIMEOUT_MS, signal);
      consecutiveFailures = 0;
      setState("connected");
    } catch (error) {
      if (signal.aborted) {
        return;
      }

      consecutiveFailures += 1;
      setState("error");
      log.error("WeChat getupdates failed:", error);
      const waitMs = consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
        ? BACKOFF_DELAY_MS
        : RETRY_DELAY_MS;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        consecutiveFailures = 0;
      }
      await delay(waitMs, signal).catch(() => undefined);
    }
  }
}

export async function startWeChatRuntime(options: {
  readonly baseUrl: string;
  readonly token: string;
  readonly eventHandler: (data: unknown) => Promise<void>;
  readonly onStateChange?: (state: WeChatChannelState) => void;
}): Promise<void> {
  stopWeChatRuntime();
  runtime.config = { baseUrl: options.baseUrl, token: options.token };
  runtime.syncBuf = loadWeChatSyncBuf();
  runtime.contextTokens = loadWeChatContextTokens();
  runtime.typingTickets.clear();
  runtime.eventHandler = options.eventHandler;
  runtime.stateListener = options.onStateChange;
  runtime.abortController = new AbortController();
  setState("connecting");

  try {
    await pollOnce(STARTUP_POLL_TIMEOUT_MS, runtime.abortController.signal);
    setState("connected");
  } catch (error) {
    stopWeChatRuntime();
    throw error;
  }

  const signal = runtime.abortController.signal;
  runtime.monitorTask = monitorLoop(signal).finally(() => {
    if (runtime.abortController?.signal === signal) {
      runtime.monitorTask = null;
      runtime.abortController = null;
      runtime.eventHandler = null;
      runtime.stateListener = undefined;
      setState("disconnected");
    }
  });
}

export function stopWeChatRuntime(): void {
  runtime.abortController?.abort();
  runtime.abortController = null;
  runtime.monitorTask = null;
  runtime.eventHandler = null;
  runtime.stateListener = undefined;
  runtime.typingTickets.clear();
  setState("disconnected");
}

export function getWeChatRuntimeState(): WeChatChannelState {
  return runtime.state;
}

export function getWeChatRuntimeConfig(): RuntimeConfig {
  return currentConfig();
}

export function getWeChatContextToken(chatId: string): string | undefined {
  return runtime.contextTokens.get(chatId);
}

export function setWeChatContextToken(chatId: string, token: string): void {
  if (!token.trim()) {
    return;
  }
  runtime.contextTokens.set(chatId, token);
  saveWeChatContextTokens(runtime.contextTokens);
}

export function getWeChatTypingTicket(chatId: string): string | undefined {
  return runtime.typingTickets.get(chatId);
}

export function setWeChatTypingTicket(chatId: string, response: WeChatConfigResponse): string | undefined {
  const typingTicket = response.typing_ticket?.trim();
  if (!typingTicket) {
    return undefined;
  }
  runtime.typingTickets.set(chatId, typingTicket);
  return typingTicket;
}

export async function refreshWeChatTypingTicket(chatId: string): Promise<string | undefined> {
  const { baseUrl, token } = currentConfig();
  const response = await getWeChatConfig({
    baseUrl,
    token,
    ilinkUserId: chatId,
    contextToken: getWeChatContextToken(chatId),
  });
  return setWeChatTypingTicket(chatId, response);
}
