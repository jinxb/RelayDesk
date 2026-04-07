import { randomBytes } from "node:crypto";
import { sendStream } from "./client.js";
import type { MessageStatus } from "./message-format.js";

const STREAM_SEND_INTERVAL_MS = 900;
const STREAM_SAFE_TTL_MS = 5 * 60 * 1000;

interface PendingUpdate {
  message: string;
  status: MessageStatus;
  reqId?: string;
}

export interface StreamState {
  chatId: string;
  content: string;
  createdAt: number;
  lastSentAt: number;
  closed: boolean;
  expired: boolean;
  flushing: boolean;
  expireLogged: boolean;
  pendingUpdate?: PendingUpdate;
}

const streamStates = new Map<string, StreamState>();
let currentReqId: string | null = null;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function setCurrentReqId(reqId: string | null) {
  currentReqId = reqId;
}

export function getReqId(
  explicitReqId: string | undefined,
  log: { warn: (msg: string) => void },
) {
  const id = explicitReqId ?? currentReqId;
  if (!id) {
    log.warn("No req_id - cannot send WeWork reply");
    return "";
  }
  return id;
}

export function generateStreamId() {
  return `${Date.now()}-${randomBytes(8).toString("hex")}`;
}

export function getStreamState(streamId: string) {
  return streamStates.get(streamId);
}

export function deleteStreamState(streamId: string) {
  streamStates.delete(streamId);
}

function markExpired(
  state: StreamState,
  streamId: string,
  log: { warn: (msg: string) => void },
) {
  state.expired = true;
  if (!state.expireLogged) {
    state.expireLogged = true;
    log.warn(`Stream expired locally, switching to text fallback: streamId=${streamId}`);
  }
}

export function getOrCreateStreamState(streamId: string, chatId: string) {
  const existing = streamStates.get(streamId);
  if (existing) return existing;

  const state: StreamState = {
    chatId,
    content: "",
    createdAt: Date.now(),
    lastSentAt: 0,
    closed: false,
    expired: false,
    flushing: false,
    expireLogged: false,
  };
  streamStates.set(streamId, state);
  return state;
}

export async function flushStreamUpdate(
  streamId: string,
  state: StreamState,
  log: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
  },
) {
  if (state.flushing || state.closed || state.expired) return;
  state.flushing = true;

  try {
    while (state.pendingUpdate && !state.closed && !state.expired) {
      const queued = state.pendingUpdate;
      state.pendingUpdate = undefined;

      if (Date.now() - state.createdAt >= STREAM_SAFE_TTL_MS) {
        markExpired(state, streamId, log);
        break;
      }

      const elapsed = Date.now() - state.lastSentAt;
      if (elapsed < STREAM_SEND_INTERVAL_MS) {
        await wait(STREAM_SEND_INTERVAL_MS - elapsed);
      }

      if (state.closed || state.expired) break;

      sendStream(getReqId(queued.reqId, log), streamId, queued.message, false);
      state.lastSentAt = Date.now();
      log.info(`Message updated: ${queued.status}, streamId=${streamId}`);
    }
  } finally {
    state.flushing = false;
  }
}

export function shouldFallbackToText(state: StreamState | undefined) {
  return !!state && (state.expired || Date.now() - state.createdAt >= STREAM_SAFE_TTL_MS);
}

export async function waitForStreamGap(state: StreamState | undefined) {
  if (!state) return;
  const elapsed = Date.now() - state.lastSentAt;
  if (elapsed < STREAM_SEND_INTERVAL_MS) {
    await wait(STREAM_SEND_INTERVAL_MS - elapsed);
  }
}
