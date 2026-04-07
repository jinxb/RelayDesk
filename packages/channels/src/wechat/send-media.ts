import { basename, extname, win32 } from "node:path";
import { createLogger } from "../../../state/src/index.js";
import {
  WeChatItemType,
  sendWeChatMessageItems,
} from "./api.js";
import type { UploadedWeChatMedia } from "./upload.js";
import {
  uploadWeChatAttachmentFile,
  uploadWeChatImageFile,
  uploadWeChatVideoFile,
} from "./upload.js";

const log = createLogger("WeChatSendMedia");
const WECHAT_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);
const WECHAT_VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"]);
const WECHAT_VOICE_EXTENSIONS = new Set([".ogg", ".oga", ".mp3", ".m4a", ".wav", ".opus", ".amr"]);

export type WeChatGeneratedMediaKind = "image" | "video" | "voice" | "file";

function resolveWeChatFileName(filePath: string): string {
  return filePath.includes("\\") ? win32.basename(filePath) : basename(filePath);
}

export function resolveWeChatGeneratedMediaKind(filePath: string): WeChatGeneratedMediaKind {
  const extension = extname(resolveWeChatFileName(filePath)).toLowerCase();
  if (WECHAT_IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  if (WECHAT_VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }
  if (WECHAT_VOICE_EXTENSIONS.has(extension)) {
    return "voice";
  }
  return "file";
}

function buildMediaRef(uploaded: UploadedWeChatMedia) {
  return {
    encrypt_query_param: uploaded.encryptedQueryParam,
    aes_key: uploaded.aesKeyBase64,
    encrypt_type: 1,
  };
}

async function sendWeChatMediaMessage(options: {
  readonly baseUrl: string;
  readonly token: string;
  readonly toUserId: string;
  readonly clientId: string;
  readonly contextToken?: string;
  readonly kind: "image" | "video" | "file";
  readonly fileName: string;
  readonly uploaded: UploadedWeChatMedia;
}) {
  const items =
    options.kind === "image"
      ? [{
          type: WeChatItemType.IMAGE,
          image_item: {
            media: buildMediaRef(options.uploaded),
            mid_size: options.uploaded.ciphertextSize,
          },
        }]
      : options.kind === "video"
        ? [{
            type: WeChatItemType.VIDEO,
            video_item: {
              media: buildMediaRef(options.uploaded),
              video_size: options.uploaded.ciphertextSize,
            },
          }]
        : [{
            type: WeChatItemType.FILE,
            file_item: {
              media: buildMediaRef(options.uploaded),
              file_name: options.fileName,
              len: String(options.uploaded.fileSize),
            },
          }];

  await sendWeChatMessageItems({
    baseUrl: options.baseUrl,
    token: options.token,
    toUserId: options.toUserId,
    clientId: options.clientId,
    items,
    contextToken: options.contextToken,
  });
}

export async function sendWeChatNativeMediaFile(options: {
  readonly baseUrl: string;
  readonly token: string;
  readonly toUserId: string;
  readonly clientId: string;
  readonly contextToken?: string;
  readonly filePath: string;
}) {
  const kind = resolveWeChatGeneratedMediaKind(options.filePath);
  const fileName = resolveWeChatFileName(options.filePath);

  if (kind === "voice") {
    throw new Error(`WeChat native voice send is not implemented for ${fileName}`);
  }

  const uploaded =
    kind === "image"
      ? await uploadWeChatImageFile(options)
      : kind === "video"
        ? await uploadWeChatVideoFile(options)
        : await uploadWeChatAttachmentFile(options);

  log.info(`WeChat native media send prepared: kind=${kind}, file=${fileName}`);
  await sendWeChatMediaMessage({
    ...options,
    kind,
    fileName,
    uploaded,
  });
}
