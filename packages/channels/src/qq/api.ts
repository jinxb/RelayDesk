import { readFile, stat } from "node:fs/promises";
import type { Config } from "../../../state/src/index.js";
import {
  qqApiRequest,
  qqPostPassiveMessage,
} from "./request.js";

const IMAGE_FILE_TYPE = 1;
const FILE_FILE_TYPE = 4;
const MEDIA_MESSAGE_TYPE = 7;
const TEXT_MESSAGE_TYPE = 0;
const INPUT_NOTIFY_MESSAGE_TYPE = 6;
const DEFAULT_INPUT_SECONDS = 60;
const MAX_QQ_UPLOAD_BYTES = 100 * 1024 * 1024;
const QQ_UPLOAD_FILE_NAME_PATTERN = /[<>:"/\\|?*\x00-\x1F]/g;

interface QQApiMessageResponse {
  id?: string;
}

interface QQUploadMediaResponse {
  file_info?: string;
}

function resolveReplySequenceKey(replyToMessageId?: string): string | undefined {
  return replyToMessageId ? `msg:${replyToMessageId}` : undefined;
}

function buildTextMessageBody(
  content: string,
  replyToMessageId?: string,
  msgSeq?: number,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    content,
    msg_type: TEXT_MESSAGE_TYPE,
  };
  if (replyToMessageId) {
    body.msg_id = replyToMessageId;
  }
  if (msgSeq !== undefined) {
    body.msg_seq = msgSeq;
  }
  return body;
}

function buildMediaMessageBody(
  fileInfo: string,
  replyToMessageId?: string,
  msgSeq?: number,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    msg_type: MEDIA_MESSAGE_TYPE,
    media: { file_info: fileInfo },
  };
  if (replyToMessageId) {
    body.msg_id = replyToMessageId;
  }
  if (msgSeq !== undefined) {
    body.msg_seq = msgSeq;
  }
  return body;
}

function buildInputNotifyBody(
  replyToMessageId: string,
  msgSeq: number,
  inputSeconds = DEFAULT_INPUT_SECONDS,
): Record<string, unknown> {
  return {
    msg_type: INPUT_NOTIFY_MESSAGE_TYPE,
    input_notify: {
      input_type: 1,
      input_second: inputSeconds,
    },
    msg_id: replyToMessageId,
    msg_seq: msgSeq,
  };
}

async function uploadQQMedia(
  config: Config,
  path: string,
  body: Record<string, unknown>,
): Promise<string> {
  const result = await qqApiRequest<QQUploadMediaResponse>(config, "POST", path, body);
  if (!result.file_info) {
    throw new Error("QQ media upload failed: file_info missing");
  }
  return result.file_info;
}

async function readFileAsBase64(filePath: string): Promise<string> {
  const file = await stat(filePath);
  if (file.size > MAX_QQ_UPLOAD_BYTES) {
    throw new Error(`QQ upload exceeds ${MAX_QQ_UPLOAD_BYTES} bytes: ${filePath} (${file.size} bytes)`);
  }
  const buffer = await readFile(filePath);
  return buffer.toString("base64");
}

function sanitizeQQUploadFileName(fileName: string): string {
  const normalized = fileName.trim().replace(QQ_UPLOAD_FILE_NAME_PATTERN, "_");
  return normalized || "file";
}

function resolveQQUploadFileName(filePath: string, fileName?: string): string {
  const candidate = fileName?.trim() || filePath.split(/[\\/]/).pop() || "file";
  return sanitizeQQUploadFileName(candidate);
}

export async function sendQQPrivateTextMessage(
  config: Config,
  openid: string,
  content: string,
  replyToMessageId?: string,
): Promise<string | undefined> {
  if (replyToMessageId) {
    const result = await qqPostPassiveMessage<QQApiMessageResponse>(
      config,
      `/v2/users/${openid}/messages`,
      resolveReplySequenceKey(replyToMessageId),
      (msgSeq) => buildTextMessageBody(content, replyToMessageId, msgSeq),
    );
    return result.id;
  }

  const result = await qqApiRequest<QQApiMessageResponse>(
    config,
    "POST",
    `/v2/users/${openid}/messages`,
    buildTextMessageBody(content),
  );
  return result.id;
}

export async function sendQQPrivateTypingNotice(
  config: Config,
  openid: string,
  replyToMessageId: string,
  inputSeconds = DEFAULT_INPUT_SECONDS,
): Promise<void> {
  await qqPostPassiveMessage<QQApiMessageResponse>(
    config,
    `/v2/users/${openid}/messages`,
    resolveReplySequenceKey(replyToMessageId),
    (msgSeq) => buildInputNotifyBody(replyToMessageId, msgSeq, inputSeconds),
  );
}

export async function sendQQGroupTextMessage(
  config: Config,
  groupOpenid: string,
  content: string,
  replyToMessageId?: string,
): Promise<string | undefined> {
  if (replyToMessageId) {
    const result = await qqPostPassiveMessage<QQApiMessageResponse>(
      config,
      `/v2/groups/${groupOpenid}/messages`,
      resolveReplySequenceKey(replyToMessageId),
      (msgSeq) => buildTextMessageBody(content, replyToMessageId, msgSeq),
    );
    return result.id;
  }

  const result = await qqApiRequest<QQApiMessageResponse>(
    config,
    "POST",
    `/v2/groups/${groupOpenid}/messages`,
    buildTextMessageBody(content),
  );
  return result.id;
}

export async function sendQQChannelTextMessage(
  config: Config,
  channelId: string,
  content: string,
  replyToMessageId?: string,
): Promise<string | undefined> {
  const result = await qqApiRequest<QQApiMessageResponse>(config, "POST", `/channels/${channelId}/messages`, {
    content,
    ...(replyToMessageId ? { msg_id: replyToMessageId } : {}),
  });
  return result.id;
}

export async function sendQQPrivateImageMessage(
  config: Config,
  openid: string,
  imagePath: string,
): Promise<string | undefined> {
  const fileInfo = await uploadQQMedia(config, `/v2/users/${openid}/files`, {
    file_type: IMAGE_FILE_TYPE,
    srv_send_msg: false,
    file_data: await readFileAsBase64(imagePath),
  });
  const result = await qqApiRequest<QQApiMessageResponse>(
    config,
    "POST",
    `/v2/users/${openid}/messages`,
    buildMediaMessageBody(fileInfo),
  );
  return result.id;
}

export async function sendQQGroupImageMessage(
  config: Config,
  groupOpenid: string,
  imagePath: string,
): Promise<string | undefined> {
  const fileInfo = await uploadQQMedia(config, `/v2/groups/${groupOpenid}/files`, {
    file_type: IMAGE_FILE_TYPE,
    srv_send_msg: false,
    file_data: await readFileAsBase64(imagePath),
  });
  const result = await qqApiRequest<QQApiMessageResponse>(
    config,
    "POST",
    `/v2/groups/${groupOpenid}/messages`,
    buildMediaMessageBody(fileInfo),
  );
  return result.id;
}

export async function sendQQPrivateFileMessage(
  config: Config,
  openid: string,
  filePath: string,
  fileName?: string,
): Promise<string | undefined> {
  const resolvedName = resolveQQUploadFileName(filePath, fileName);
  const fileInfo = await uploadQQMedia(config, `/v2/users/${openid}/files`, {
    file_type: FILE_FILE_TYPE,
    srv_send_msg: false,
    file_data: await readFileAsBase64(filePath),
    file_name: resolvedName,
  });
  const result = await qqApiRequest<QQApiMessageResponse>(
    config,
    "POST",
    `/v2/users/${openid}/messages`,
    buildMediaMessageBody(fileInfo),
  );
  return result.id;
}

export async function sendQQGroupFileMessage(
  config: Config,
  groupOpenid: string,
  filePath: string,
  fileName?: string,
): Promise<string | undefined> {
  const resolvedName = resolveQQUploadFileName(filePath, fileName);
  const fileInfo = await uploadQQMedia(config, `/v2/groups/${groupOpenid}/files`, {
    file_type: FILE_FILE_TYPE,
    srv_send_msg: false,
    file_data: await readFileAsBase64(filePath),
    file_name: resolvedName,
  });
  const result = await qqApiRequest<QQApiMessageResponse>(
    config,
    "POST",
    `/v2/groups/${groupOpenid}/messages`,
    buildMediaMessageBody(fileInfo),
  );
  return result.id;
}

export {
  clearQQApiCaches,
  fetchQQAccessToken,
  getQQGatewayUrl,
} from "./request.js";
