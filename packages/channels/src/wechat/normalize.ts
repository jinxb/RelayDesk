import {
  WECHAT_CDN_BASE_URL,
  WeChatItemType,
  type WeChatApiMessage,
  type WeChatApiMessageItem,
} from "./api.js";
import { parseWeChatIncomingMessage } from "./media.js";
import type { WeChatIncomingMessage } from "./types.js";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildMessageId(message: WeChatApiMessage, item: WeChatApiMessageItem | undefined) {
  if (text(item?.text_item?.text)) {
    return text(item?.text_item?.text);
  }

  const itemId = text((item as { msg_id?: unknown } | undefined)?.msg_id);
  if (itemId) {
    return itemId;
  }

  if (typeof message.message_id === "number") {
    return String(message.message_id);
  }

  if (typeof message.seq === "number") {
    return `seq-${message.seq}`;
  }

  return `wx-${Date.now()}`;
}

function findFirstItem(
  items: readonly WeChatApiMessageItem[] | undefined,
  type: number,
) {
  return items?.find((item) => item.type === type);
}

function extractTextContent(items: readonly WeChatApiMessageItem[] | undefined) {
  const textItem = findFirstItem(items, WeChatItemType.TEXT);
  if (textItem?.text_item?.text) {
    return textItem.text_item.text;
  }

  const voiceItem = findFirstItem(items, WeChatItemType.VOICE);
  return voiceItem?.voice_item?.text ?? "";
}

function buildBaseMessage(
  message: WeChatApiMessage,
  item: WeChatApiMessageItem | undefined,
  msgType: WeChatIncomingMessage["msg_type"],
): WeChatIncomingMessage {
  return {
    msg_id: buildMessageId(message, item),
    msg_type: msgType,
    from_user_id: message.from_user_id ?? "",
    from_user_name: message.from_user_id ?? "",
    to_user_id: message.to_user_id ?? "",
    content: extractTextContent(message.item_list),
    create_time: message.create_time_ms ?? Date.now(),
    context_token: message.context_token,
  };
}

function buildImageUrl(item: WeChatApiMessageItem | undefined) {
  const token = item?.image_item?.media?.encrypt_query_param;
  return token ? `${WECHAT_CDN_BASE_URL}/download?encrypted_query_param=${encodeURIComponent(token)}` : undefined;
}

function buildFileUrl(item: WeChatApiMessageItem | undefined) {
  const media =
    item?.video_item?.media?.encrypt_query_param
    ?? item?.file_item?.media?.encrypt_query_param;
  return media ? `${WECHAT_CDN_BASE_URL}/download?encrypted_query_param=${encodeURIComponent(media)}` : undefined;
}

function normalizeMediaMessage(
  message: WeChatApiMessage,
  item: WeChatApiMessageItem,
  msgType: "image" | "voice" | "video" | "file",
): WeChatIncomingMessage {
  const incoming = buildBaseMessage(message, item, msgType);
  if (msgType === "image") {
    return {
      ...incoming,
      image_url: buildImageUrl(item),
      raw_media: item.image_item?.media,
    };
  }

  if (msgType === "voice") {
    return {
      ...incoming,
      voice_item: { text: item.voice_item?.text },
      duration: item.voice_item?.playtime,
      raw_media: item.voice_item?.media,
    };
  }

  if (msgType === "video") {
    return {
      ...incoming,
      file_url: buildFileUrl(item),
      duration: item.video_item?.play_length,
      raw_media: item.video_item?.media,
    };
  }

  return {
    ...incoming,
    file_url: buildFileUrl(item),
    file_name: item.file_item?.file_name,
    filename: item.file_item?.file_name,
    raw_media: item.file_item?.media,
  };
}

export function normalizeWeChatApiMessage(
  message: WeChatApiMessage,
): WeChatIncomingMessage | null {
  const items = message.item_list;
  if (!items?.length) {
    return null;
  }

  const imageItem = findFirstItem(items, WeChatItemType.IMAGE);
  if (imageItem) return normalizeMediaMessage(message, imageItem, "image");

  const videoItem = findFirstItem(items, WeChatItemType.VIDEO);
  if (videoItem) return normalizeMediaMessage(message, videoItem, "video");

  const fileItem = findFirstItem(items, WeChatItemType.FILE);
  if (fileItem) return normalizeMediaMessage(message, fileItem, "file");

  const voiceItem = findFirstItem(items, WeChatItemType.VOICE);
  if (voiceItem) return normalizeMediaMessage(message, voiceItem, "voice");

  const textItem = findFirstItem(items, WeChatItemType.TEXT);
  if (textItem) return buildBaseMessage(message, textItem, "text");

  return null;
}

function isIncomingMessage(data: unknown): data is WeChatIncomingMessage {
  if (!data || typeof data !== "object") {
    return false;
  }

  const value = data as Partial<WeChatIncomingMessage>;
  return typeof value.msg_type === "string" && typeof value.from_user_id === "string";
}

function isApiMessage(data: unknown): data is WeChatApiMessage {
  return Boolean(data && typeof data === "object" && Array.isArray((data as WeChatApiMessage).item_list));
}

export function coerceWeChatIncomingMessage(data: unknown): WeChatIncomingMessage | null {
  if (typeof data === "string") {
    return parseWeChatIncomingMessage(data);
  }
  if (isIncomingMessage(data)) {
    return data;
  }
  if (isApiMessage(data)) {
    return normalizeWeChatApiMessage(data);
  }
  return null;
}
