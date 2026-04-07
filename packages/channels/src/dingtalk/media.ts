import type { DWClientDownStream, RobotMessage } from "dingtalk-stream";
import {
  buildMediaContext,
  buildMediaMetadataPrompt,
  buildSavedMediaPrompt,
  downloadMediaFromUrl,
  inferExtensionFromBuffer,
  inferExtensionFromContentType,
  saveBufferMedia,
} from "../../../interaction/src/index.js";
import { createLogger } from "../../../state/src/index.js";
import { downloadRobotMessageFile } from "./client.js";

const log = createLogger("DingTalkMedia");

export type DingTalkInboundKind = "image" | "file" | "voice" | "video";
export type DingTalkRobotPayload = RobotMessage & Record<string, unknown>;

export function parseDingTalkRobotMessage(
  data: DWClientDownStream,
): RobotMessage | null {
  try {
    return JSON.parse(data.data) as RobotMessage;
  } catch (error) {
    log.error("Failed to parse DingTalk message:", error);
    return null;
  }
}

export function toDingTalkInboundKind(msgType: string): DingTalkInboundKind {
  if (msgType === "picture" || msgType === "image") return "image";
  if (msgType === "audio" || msgType === "voice") return "voice";
  if (msgType === "video") return "video";
  return "file";
}

function extractMediaPayload(
  message: DingTalkRobotPayload,
  kind: DingTalkInboundKind,
) {
  const candidates = [
    message[kind],
    kind === "image" ? message.picture : undefined,
    kind === "voice" ? message.audio : undefined,
    kind === "file" ? message.file : undefined,
    kind === "video" ? message.video : undefined,
    message.content,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") {
      return candidate as Record<string, unknown>;
    }
  }

  return null;
}

function buildMediaContextText(
  text: string | undefined,
  payload: Record<string, unknown>,
) {
  const fileName =
    typeof payload.fileName === "string"
      ? payload.fileName
      : typeof payload.file_name === "string"
        ? payload.file_name
        : undefined;
  const duration =
    typeof payload.duration === "number"
      ? payload.duration
      : typeof payload.duration === "string"
        ? payload.duration
        : undefined;
  const mediaType =
    typeof payload.fileType === "string"
      ? payload.fileType
      : typeof payload.file_type === "string"
        ? payload.file_type
        : undefined;

  return buildMediaContext(
    {
      Filename: fileName,
      MediaType: mediaType,
      Duration: duration,
    },
    text,
  );
}

export async function buildDingTalkMediaPrompt(
  message: DingTalkRobotPayload,
  kind: DingTalkInboundKind,
  robotCodeFallback?: string,
) {
  const payload = extractMediaPayload(message, kind);
  if (!payload) return null;
  const text =
    typeof message.text?.content === "string" ? message.text.content.trim() : undefined;
  const contextText = buildMediaContextText(text, payload);

  const remoteUrl = [
    payload.url,
    payload.downloadUrl,
    payload.download_url,
    payload.picUrl,
  ].find((value): value is string => typeof value === "string" && value.length > 0);
  const downloadCode = [
    payload.downloadCode,
    payload.download_code,
    payload.pictureDownloadCode,
    payload.picture_download_code,
  ].find((value): value is string => typeof value === "string" && value.length > 0);

  let localPath: string | undefined;
  if (remoteUrl) {
    try {
      localPath = await downloadMediaFromUrl(remoteUrl, {
        basenameHint: typeof payload.fileName === "string" ? payload.fileName : undefined,
        fallbackExtension: kind === "image" ? "jpg" : "bin",
      });
    } catch {
      localPath = undefined;
    }
  }

  if (!localPath && downloadCode) {
    try {
      const robotCode =
        (typeof message.robotCode === "string" && message.robotCode.length > 0
          ? message.robotCode
          : robotCodeFallback) ?? "";
      if (robotCode) {
        const downloaded = await downloadRobotMessageFile(downloadCode, robotCode);
        const extension =
          inferExtensionFromContentType(downloaded.contentType ?? "") ||
          inferExtensionFromBuffer(downloaded.buffer) ||
          (kind === "image" ? ".jpg" : ".bin");
        const basenameHint =
          downloaded.filename ??
          (typeof payload.fileName === "string" ? payload.fileName : undefined);
        localPath = await saveBufferMedia(downloaded.buffer, extension, basenameHint);
      }
    } catch {
      localPath = undefined;
    }
  }

  if (localPath) {
    return buildSavedMediaPrompt({
      source: "DingTalk",
      kind,
      localPath,
      text: contextText,
    });
  }

  return buildMediaMetadataPrompt({
    source: "DingTalk",
    kind,
    text: contextText,
    metadata: {
      msgtype: message.msgtype,
      conversationType: message.conversationType,
      senderNick: message.senderNick,
      payload,
    },
  });
}
