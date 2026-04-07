import {
  buildMediaContext,
  buildMediaMetadataPrompt,
  buildSavedMediaBatchPrompt,
  buildSavedMediaPrompt,
  downloadMediaFromUrl,
} from "../../../interaction/src/index.js";
import type { QQAttachment, QQMessageEvent } from "./types.js";

type QQAttachmentKind = "image" | "file" | "voice" | "video";

function classifyAttachment(attachment: QQAttachment): QQAttachmentKind {
  if (attachment.contentType?.startsWith("image/")) return "image";
  if (attachment.contentType?.startsWith("audio/")) return "voice";
  if (attachment.contentType?.startsWith("video/")) return "video";
  const filename = attachment.filename?.toLowerCase() ?? "";
  if (/\.(png|jpe?g|gif|webp|bmp)$/.test(filename)) return "image";
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/.test(filename)) return "voice";
  if (/\.(mp4|mov|avi|mkv|webm|m4v)$/.test(filename)) return "video";
  return "file";
}

async function buildAttachmentSummary(attachment: QQAttachment) {
  const kind = classifyAttachment(attachment);
  let localPath: string | undefined;
  if (attachment.url) {
    try {
      localPath = await downloadMediaFromUrl(attachment.url, {
        basenameHint: attachment.filename,
        fallbackExtension:
          kind === "image"
            ? "jpg"
            : kind === "voice"
              ? "ogg"
              : kind === "video"
                ? "mp4"
                : "bin",
      });
    } catch {
      localPath = undefined;
    }
  }

  return {
    kind,
    url: attachment.url,
    localPath,
    filename: attachment.filename,
    contentType: attachment.contentType,
    size: attachment.size,
    width: attachment.width,
    height: attachment.height,
    raw: attachment.raw,
  };
}

function singleAttachmentPrompt(
  event: QQMessageEvent,
  attachment: Awaited<ReturnType<typeof buildAttachmentSummary>>,
) {
  return buildSavedMediaPrompt({
    source: "QQ",
    kind: attachment.kind,
    localPath: attachment.localPath!,
    text: buildMediaContext(
      {
        Filename: attachment.filename,
        MimeType: attachment.contentType,
        Size: attachment.size,
        Width: attachment.width,
        Height: attachment.height,
      },
      event.content || undefined,
    ),
  });
}

export async function buildQQAttachmentPrompt(event: QQMessageEvent) {
  if (!event.attachments?.length) {
    return null;
  }

  const attachments = await Promise.all(event.attachments.map(buildAttachmentSummary));
  if (attachments.length === 1 && attachments[0].localPath) {
    return singleAttachmentPrompt(event, attachments[0]);
  }

  const savedAttachments = attachments.filter((attachment) => attachment.localPath);
  if (savedAttachments.length > 1 && savedAttachments.length === attachments.length) {
    return buildSavedMediaBatchPrompt({
      source: "QQ",
      text: event.content || undefined,
      items: savedAttachments.map((attachment) => ({
        kind: attachment.kind,
        localPath: attachment.localPath!,
        label: attachment.filename,
      })),
    });
  }

  return buildMediaMetadataPrompt({
    source: "QQ",
    kind: "attachment",
    text: event.content,
    metadata: attachments,
    guidance:
      "If direct attachment fetch is not available, explain the limitation and ask the user for a text summary or a resend via Telegram/Feishu/WeWork.",
  });
}
