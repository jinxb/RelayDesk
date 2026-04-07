import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createLogger } from "../../../state/src/index.js";
import {
  WeChatUploadMediaType,
  getWeChatUploadUrl,
} from "./api.js";
import { computeWeChatCdnCiphertextSize } from "./cdn-crypto.js";
import { uploadBufferToWeChatCdn } from "./cdn-upload.js";

const log = createLogger("WeChatUpload");

export interface UploadedWeChatMedia {
  readonly encryptedQueryParam: string;
  readonly aesKeyBase64: string;
  readonly fileSize: number;
  readonly ciphertextSize: number;
}

async function uploadWeChatMedia(options: {
  readonly baseUrl: string;
  readonly token: string;
  readonly toUserId: string;
  readonly filePath: string;
  readonly mediaType: number;
}) {
  const buffer = await readFile(options.filePath);
  const fileKey = randomBytes(16).toString("hex");
  const aesKey = randomBytes(16);
  const ciphertextSize = computeWeChatCdnCiphertextSize(buffer.length);
  const upload = await getWeChatUploadUrl({
    baseUrl: options.baseUrl,
    token: options.token,
    fileKey,
    mediaType: options.mediaType,
    toUserId: options.toUserId,
    rawSize: buffer.length,
    rawFileMd5: createHash("md5").update(buffer).digest("hex"),
    fileSize: ciphertextSize,
    noNeedThumb: true,
    aesKeyHex: aesKey.toString("hex"),
  });

  const uploadParam = upload.upload_param?.trim();
  if (!uploadParam) {
    throw new Error(`WeChat upload URL missing upload_param for ${options.filePath}`);
  }

  const encryptedQueryParam = await uploadBufferToWeChatCdn({
    buffer,
    uploadParam,
    fileKey,
    aesKey,
  });

  log.info(`WeChat media uploaded: type=${options.mediaType}, bytes=${buffer.length}`);
  return {
    encryptedQueryParam,
    aesKeyBase64: aesKey.toString("base64"),
    fileSize: buffer.length,
    ciphertextSize,
  } satisfies UploadedWeChatMedia;
}

export async function uploadWeChatImageFile(options: {
  readonly baseUrl: string;
  readonly token: string;
  readonly toUserId: string;
  readonly filePath: string;
}) {
  return uploadWeChatMedia({
    ...options,
    mediaType: WeChatUploadMediaType.IMAGE,
  });
}

export async function uploadWeChatVideoFile(options: {
  readonly baseUrl: string;
  readonly token: string;
  readonly toUserId: string;
  readonly filePath: string;
}) {
  return uploadWeChatMedia({
    ...options,
    mediaType: WeChatUploadMediaType.VIDEO,
  });
}

export async function uploadWeChatAttachmentFile(options: {
  readonly baseUrl: string;
  readonly token: string;
  readonly toUserId: string;
  readonly filePath: string;
}) {
  return uploadWeChatMedia({
    ...options,
    mediaType: WeChatUploadMediaType.FILE,
  });
}
