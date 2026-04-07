import { randomBytes } from "node:crypto";
import { createLogger } from "../../../state/src/index.js";

const log = createLogger("WeChatApi");
const DEFAULT_API_TIMEOUT_MS = 15_000;
const DEFAULT_LONG_POLL_TIMEOUT_MS = 35_000;

export const WECHAT_CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";

export const WeChatItemType = {
  TEXT: 1,
  IMAGE: 2,
  VOICE: 3,
  FILE: 4,
  VIDEO: 5,
} as const;

export const WeChatUploadMediaType = {
  IMAGE: 1,
  VIDEO: 2,
  FILE: 3,
  VOICE: 4,
} as const;
type WeChatItemTypeValue = (typeof WeChatItemType)[keyof typeof WeChatItemType];
export interface WeChatApiMediaRef {
  encrypt_query_param?: string;
  aes_key?: string;
}
export interface WeChatApiMessageItem {
  type?: WeChatItemTypeValue;
  text_item?: { text?: string };
  image_item?: {
    media?: WeChatApiMediaRef;
    aeskey?: string;
    mid_size?: number;
  };
  voice_item?: {
    media?: WeChatApiMediaRef;
    text?: string;
    playtime?: number;
  };
  file_item?: {
    media?: WeChatApiMediaRef;
    file_name?: string;
    len?: string;
  };
  video_item?: {
    media?: WeChatApiMediaRef;
    video_size?: number;
  };
}
export interface WeChatApiMessage {
  seq?: number;
  message_id?: number;
  from_user_id?: string;
  to_user_id?: string;
  create_time_ms?: number;
  item_list?: WeChatApiMessageItem[];
  context_token?: string;
}
interface WeChatGetUpdatesResponse {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  msgs?: WeChatApiMessage[];
  get_updates_buf?: string;
  longpolling_timeout_ms?: number;
}
interface WeChatConfigResponse {
  ret?: number;
  errmsg?: string;
  typing_ticket?: string;
}
export interface WeChatUploadUrlResponse {
  upload_param?: string;
  thumb_upload_param?: string;
}
export type { WeChatConfigResponse, WeChatGetUpdatesResponse };

function ensureTrailingSlash(url: string) {
  return url.endsWith("/") ? url : `${url}/`;
}
function buildHeaders(token: string, body: string): Record<string, string> {
  return {
    AuthorizationType: "ilink_bot_token",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Content-Length": String(Buffer.byteLength(body, "utf-8")),
    "X-WECHAT-UIN": Buffer.from(String(randomBytes(4).readUInt32BE(0)), "utf-8").toString("base64"),
  };
}
async function postWeChatJson(options: {
  readonly baseUrl: string;
  readonly token: string;
  readonly endpoint: string;
  readonly body: string;
  readonly timeoutMs: number;
  readonly label: string;
  readonly signal?: AbortSignal;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const url = new URL(options.endpoint, ensureTrailingSlash(options.baseUrl));
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: buildHeaders(options.token, options.body),
      body: options.body,
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`${options.label} ${response.status}: ${raw}`);
    }
    return raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    log.error(`${options.label} failed:`, error);
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}
export async function sendWeChatMessageItems(options: {
  readonly baseUrl: string;
  readonly token: string;
  readonly toUserId: string;
  readonly clientId: string;
  readonly items: readonly WeChatApiMessageItem[];
  readonly contextToken?: string;
  readonly signal?: AbortSignal;
}) {
  await postWeChatJson({
    baseUrl: options.baseUrl,
    token: options.token,
    endpoint: "ilink/bot/sendmessage",
    body: JSON.stringify({
      msg: {
        from_user_id: "",
        to_user_id: options.toUserId,
        client_id: options.clientId,
        message_type: 2,
        message_state: 2,
        item_list: options.items,
        context_token: options.contextToken,
      },
      base_info: { channel_version: "relaydesk" },
    }),
    timeoutMs: DEFAULT_API_TIMEOUT_MS,
    label: "WeChat sendmessage",
    signal: options.signal,
  });
}
export async function getWeChatUpdates(options: {
  readonly baseUrl: string;
  readonly token: string;
  readonly syncBuf: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}) {
  try {
    return await postWeChatJson({
      baseUrl: options.baseUrl,
      token: options.token,
      endpoint: "ilink/bot/getupdates",
      body: JSON.stringify({
        get_updates_buf: options.syncBuf,
        base_info: { channel_version: "relaydesk" },
      }),
      timeoutMs: options.timeoutMs ?? DEFAULT_LONG_POLL_TIMEOUT_MS,
      label: "WeChat getupdates",
      signal: options.signal,
    }) as WeChatGetUpdatesResponse;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ret: 0,
        msgs: [],
        get_updates_buf: options.syncBuf,
      } satisfies WeChatGetUpdatesResponse;
    }
    throw error;
  }
}
export async function sendWeChatTextMessage(options: {
  readonly baseUrl: string;
  readonly token: string;
  readonly toUserId: string;
  readonly text: string;
  readonly clientId: string;
  readonly contextToken?: string;
  readonly signal?: AbortSignal;
}) {
  await sendWeChatMessageItems({
    baseUrl: options.baseUrl,
    token: options.token,
    toUserId: options.toUserId,
    clientId: options.clientId,
    items: [
      {
        type: WeChatItemType.TEXT,
        text_item: { text: options.text },
      },
    ],
    contextToken: options.contextToken,
    signal: options.signal,
  });
}
export async function getWeChatUploadUrl(options: {
  readonly baseUrl: string;
  readonly token: string;
  readonly fileKey: string;
  readonly mediaType: number;
  readonly toUserId: string;
  readonly rawSize: number;
  readonly rawFileMd5: string;
  readonly fileSize: number;
  readonly noNeedThumb?: boolean;
  readonly aesKeyHex: string;
  readonly signal?: AbortSignal;
}) {
  return await postWeChatJson({
    baseUrl: options.baseUrl,
    token: options.token,
    endpoint: "ilink/bot/getuploadurl",
    body: JSON.stringify({
      filekey: options.fileKey,
      media_type: options.mediaType,
      to_user_id: options.toUserId,
      rawsize: options.rawSize,
      rawfilemd5: options.rawFileMd5,
      filesize: options.fileSize,
      no_need_thumb: options.noNeedThumb ?? true,
      aeskey: options.aesKeyHex,
      base_info: { channel_version: "relaydesk" },
    }),
    timeoutMs: DEFAULT_API_TIMEOUT_MS,
    label: "WeChat getuploadurl",
    signal: options.signal,
  }) as WeChatUploadUrlResponse;
}
export async function getWeChatConfig(options: {
  readonly baseUrl: string;
  readonly token: string;
  readonly ilinkUserId: string;
  readonly contextToken?: string;
  readonly signal?: AbortSignal;
}) {
  return await postWeChatJson({
    baseUrl: options.baseUrl,
    token: options.token,
    endpoint: "ilink/bot/getconfig",
    body: JSON.stringify({
      ilink_user_id: options.ilinkUserId,
      context_token: options.contextToken,
      base_info: { channel_version: "relaydesk" },
    }),
    timeoutMs: DEFAULT_API_TIMEOUT_MS,
    label: "WeChat getconfig",
    signal: options.signal,
  }) as WeChatConfigResponse;
}
export async function sendWeChatTypingStatus(options: {
  readonly baseUrl: string;
  readonly token: string;
  readonly ilinkUserId: string;
  readonly typingTicket: string;
  readonly status: 1 | 2;
  readonly signal?: AbortSignal;
}) {
  await postWeChatJson({
    baseUrl: options.baseUrl,
    token: options.token,
    endpoint: "ilink/bot/sendtyping",
    body: JSON.stringify({
      ilink_user_id: options.ilinkUserId,
      typing_ticket: options.typingTicket,
      status: options.status,
      base_info: { channel_version: "relaydesk" },
    }),
    timeoutMs: DEFAULT_API_TIMEOUT_MS,
    label: "WeChat sendtyping",
    signal: options.signal,
  });
}
