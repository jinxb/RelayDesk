import {
  buildMediaContext,
  buildMediaMetadataPrompt,
  buildSavedMediaPrompt,
  downloadMediaFromUrl,
} from "../../../interaction/src/index.js";
import type { WeChatIncomingMessage } from "./types.js";

type WeChatInboundMediaKind = "image" | "file" | "voice" | "video";
export const WECHAT_VOICE_TRANSCRIPT_REQUIRED_MESSAGE =
  "微信未提供这条语音的转文字结果，请先开启微信语音转文字后重新发送。";

function getWeChatFilename(message: WeChatIncomingMessage): string | undefined {
  return message.filename || message.file_name;
}

function getWeChatMimeType(message: WeChatIncomingMessage): string | undefined {
  return message.mime_type || message.mimeType;
}

function getWeChatFileSize(message: WeChatIncomingMessage): number | undefined {
  if (typeof message.file_size === "number") return message.file_size;
  if (typeof message.size === "number") return message.size;
  return undefined;
}

export function parseWeChatIncomingMessage(raw: string): WeChatIncomingMessage | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.msg_type !== "string") {
      return null;
    }
    return parsed as unknown as WeChatIncomingMessage;
  } catch {
    return null;
  }
}

export function extractWeChatVoiceTranscript(
  message: WeChatIncomingMessage,
): string | null {
  const transcript =
    message.voice_item?.text?.trim() ??
    message.voice_text?.trim() ??
    "";
  return transcript || null;
}

export async function buildWeChatMediaPrompt(message: WeChatIncomingMessage) {
  const kind = message.msg_type as WeChatInboundMediaKind;
  if (!["image", "file", "voice", "video"].includes(kind)) {
    return null;
  }

  if (kind === "voice") {
    const transcript = extractWeChatVoiceTranscript(message);
    return transcript;
  }

  const mediaUrl = kind === "image" ? message.image_url : message.file_url;
  const contextText = buildMediaContext(
    {
      FromUser: message.from_user_name || message.from_user_id,
      MessageType: message.msg_type,
      Filename: getWeChatFilename(message),
      MimeType: getWeChatMimeType(message),
      FileSize: getWeChatFileSize(message),
      Duration: message.duration,
    },
    message.content || undefined,
  );

  if (typeof mediaUrl === "string" && mediaUrl.length > 0) {
    try {
      const savedPath = await downloadMediaFromUrl(mediaUrl, {
        basenameHint: getWeChatFilename(message) || message.msg_id,
        fallbackExtension:
          kind === "image"
            ? "jpg"
            : kind === "voice"
              ? "ogg"
              : kind === "video"
                ? "mp4"
                : "bin",
      });
      return buildSavedMediaPrompt({
        source: "WeChat",
        kind,
        localPath: savedPath,
        text: contextText,
      });
    } catch {
      // Fall through to metadata-only prompt.
    }
  }

  return buildMediaMetadataPrompt({
    source: "WeChat",
    kind,
    text: contextText,
    metadata: {
      msg_id: message.msg_id,
      from_user_id: message.from_user_id,
      filename: getWeChatFilename(message),
      mime_type: getWeChatMimeType(message),
      file_size: getWeChatFileSize(message),
      duration: message.duration,
      image_url: message.image_url,
      file_url: message.file_url,
    },
  });
}
