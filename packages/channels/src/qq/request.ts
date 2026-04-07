import type { Config } from "../../../state/src/index.js";

const TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";
const API_BASE = "https://api.sgroup.qq.com";
const TOKEN_REFRESH_GRACE_MS = 5 * 60 * 1000;
const DEFAULT_TOKEN_TTL_MS = 7200 * 1000;
const MAX_DUPLICATE_MSG_SEQ_RETRIES = 5;
const MSG_SEQ_BASE = 1_000_000;

interface QQTokenState {
  readonly token: string;
  readonly expiresAt: number;
}

interface QQApiError extends Error {
  readonly status?: number;
  readonly body?: string;
}

const tokenStateByAppId = new Map<string, QQTokenState>();
const pendingTokenByAppId = new Map<string, Promise<string>>();
const msgSeqByKey = new Map<string, number>();
let fallbackMsgSeq = 0;

function assertQQCredentials(config: Config): { appId: string; secret: string } {
  if (!config.qqAppId || !config.qqSecret) {
    throw new Error("QQ Bot App ID and Secret are required");
  }
  return { appId: config.qqAppId, secret: config.qqSecret };
}

function buildAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: `QQBot ${token}`,
    "Content-Type": "application/json",
  };
}

function createQQApiError(
  method: string,
  path: string,
  status: number,
  body: string,
): QQApiError {
  const error = new Error(
    `QQ API ${method} ${path} failed: HTTP ${status} ${body.slice(0, 200)}`,
  ) as QQApiError;
  Object.defineProperty(error, "status", { value: status, enumerable: true });
  Object.defineProperty(error, "body", { value: body, enumerable: true });
  return error;
}

function getCachedToken(appId: string): string | null {
  const cached = tokenStateByAppId.get(appId);
  if (!cached) {
    return null;
  }
  if (Date.now() >= cached.expiresAt - TOKEN_REFRESH_GRACE_MS) {
    tokenStateByAppId.delete(appId);
    return null;
  }
  return cached.token;
}

export async function fetchQQAccessToken(config: Config): Promise<string> {
  const { appId, secret } = assertQQCredentials(config);
  const cached = getCachedToken(appId);
  if (cached) {
    return cached;
  }

  const inFlight = pendingTokenByAppId.get(appId);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    try {
      const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId,
          clientSecret: secret,
        }),
      });
      const data = (await response.json()) as {
        access_token?: string;
        expires_in?: number;
        message?: string;
      };

      if (!response.ok || !data.access_token) {
        throw new Error(data.message || `Failed to get QQ access token: HTTP ${response.status}`);
      }

      tokenStateByAppId.set(appId, {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in ?? DEFAULT_TOKEN_TTL_MS / 1000) * 1000,
      });
      return data.access_token;
    } finally {
      pendingTokenByAppId.delete(appId);
    }
  })();

  pendingTokenByAppId.set(appId, request);
  return request;
}

export async function qqApiRequest<T>(
  config: Config,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await fetchQQAccessToken(config);
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: buildAuthHeaders(token),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (response.status === 401 && config.qqAppId) {
      tokenStateByAppId.delete(config.qqAppId);
    }
    throw createQQApiError(method, path, response.status, text);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

function nextMsgSeq(sequenceKey?: string): number {
  if (!sequenceKey) {
    fallbackMsgSeq += 1;
    return MSG_SEQ_BASE + fallbackMsgSeq;
  }

  const next = (msgSeqByKey.get(sequenceKey) ?? 0) + 1;
  msgSeqByKey.set(sequenceKey, next);
  return MSG_SEQ_BASE + next;
}

function isDuplicateMsgSeqError(error: unknown): boolean {
  const record = error as QQApiError | undefined;
  if (record?.status !== 400 || !record.body) {
    return false;
  }

  try {
    const parsed = JSON.parse(record.body) as {
      code?: number;
      err_code?: number;
      message?: string;
    };
    if (parsed.code === 40054005 || parsed.err_code === 40054005) {
      return true;
    }
    const message = parsed.message?.toLowerCase() ?? "";
    return message.includes("msgseq") && (message.includes("去重") || message.includes("duplicate"));
  } catch {
    const text = record.body.toLowerCase();
    return text.includes("msgseq") && (text.includes("去重") || text.includes("duplicate"));
  }
}

export async function qqPostPassiveMessage<T>(
  config: Config,
  path: string,
  sequenceKey: string | undefined,
  buildBody: (msgSeq: number) => Record<string, unknown>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_DUPLICATE_MSG_SEQ_RETRIES; attempt += 1) {
    try {
      return await qqApiRequest<T>(config, "POST", path, buildBody(nextMsgSeq(sequenceKey)));
    } catch (error) {
      lastError = error;
      if (!isDuplicateMsgSeqError(error) || attempt === MAX_DUPLICATE_MSG_SEQ_RETRIES) {
        throw error;
      }
    }
  }
  throw lastError;
}

export async function getQQGatewayUrl(config: Config): Promise<string> {
  const data = await qqApiRequest<{ url: string }>(config, "GET", "/gateway");
  return data.url;
}

export function clearQQApiCaches(): void {
  tokenStateByAppId.clear();
  pendingTokenByAppId.clear();
  msgSeqByKey.clear();
  fallbackMsgSeq = 0;
}
