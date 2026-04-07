import { existsSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import {
  getDingTalkActiveTarget,
  type Platform,
} from "../../state/src/index.js";
import type { CurrentTaskMediaKind, CurrentTaskMediaTarget } from "../../interaction/src/index.js";
import { sendImageReply as sendDingTalkImageReply, sendFileReply as sendDingTalkFileReply } from "../../channels/src/dingtalk/message-sender.js";
import { sendImageReply as sendFeishuImageReply, sendFileReply as sendFeishuFileReply } from "../../channels/src/feishu/message-sender.js";
import { sendImageReply as sendQQImageReply, sendFileReply as sendQQFileReply } from "../../channels/src/qq/message-sender.js";
import { sendImageReply as sendTelegramImageReply, sendFileReply as sendTelegramFileReply } from "../../channels/src/telegram/message-sender.js";
import { sendImageReply as sendWeChatImageReply, sendFileReply as sendWeChatFileReply } from "../../channels/src/wechat/message-sender.js";

export interface CurrentTaskMediaRequest {
  readonly kind: CurrentTaskMediaKind;
  readonly filePath: string;
}

export interface CurrentTaskMediaReceipt {
  readonly ok: true;
  readonly channel: Platform;
  readonly chatId: string;
  readonly kind: CurrentTaskMediaKind;
  readonly filePath: string;
}

function assertFilePath(filePath: string, kind: CurrentTaskMediaKind) {
  if (!filePath || !isAbsolute(filePath)) {
    throw new Error("filePath 必须是本地绝对路径。");
  }
  if (!existsSync(filePath)) {
    throw new Error(`文件不存在：${filePath}`);
  }
  if (!statSync(filePath).isFile()) {
    throw new Error(`路径不是文件：${filePath}`);
  }
  if (kind === "image" && !/\.(png|jpe?g|gif|webp|bmp|tiff?|avif)$/i.test(filePath)) {
    throw new Error("image 类型仅支持常见图片文件扩展名。");
  }
}

function assertQqTarget(chatId: string, kind: CurrentTaskMediaKind) {
  if (chatId.startsWith("channel:")) {
    throw new Error(`QQ 频道当前不支持原生${kind === "image" ? "图片" : "文件"}回传。`);
  }
}

function resolveDingTalkTarget(chatId: string) {
  const activeTarget = getDingTalkActiveTarget();
  if (!activeTarget || activeTarget.chatId !== chatId || !activeTarget.robotCode) {
    throw new Error("钉钉当前会话缺少可用的原生媒体发送目标。");
  }
  return {
    chatId: activeTarget.chatId,
    conversationType: activeTarget.conversationType,
    senderStaffId: activeTarget.userId,
    robotCode: activeTarget.robotCode,
  };
}

async function sendToChannel(
  target: CurrentTaskMediaTarget,
  request: CurrentTaskMediaRequest,
) {
  if (target.platform === "telegram") {
    return request.kind === "image"
      ? sendTelegramImageReply(target.chatId, request.filePath)
      : sendTelegramFileReply(target.chatId, request.filePath);
  }
  if (target.platform === "feishu") {
    return request.kind === "image"
      ? sendFeishuImageReply(target.chatId, request.filePath)
      : sendFeishuFileReply(target.chatId, request.filePath);
  }
  if (target.platform === "qq") {
    assertQqTarget(target.chatId, request.kind);
    return request.kind === "image"
      ? sendQQImageReply(target.chatId, request.filePath)
      : sendQQFileReply(target.chatId, request.filePath);
  }
  if (target.platform === "wechat") {
    return request.kind === "image"
      ? sendWeChatImageReply(target.chatId, request.filePath)
      : sendWeChatFileReply(target.chatId, request.filePath);
  }
  if (target.platform === "dingtalk") {
    const nativeTarget = resolveDingTalkTarget(target.chatId);
    return request.kind === "image"
      ? sendDingTalkImageReply(target.chatId, request.filePath, nativeTarget)
      : sendDingTalkFileReply(target.chatId, request.filePath, nativeTarget);
  }
  throw new Error(`${target.platform} 当前还不支持通过通用 AI 媒体工具发送附件。`);
}

export async function deliverMediaToCurrentTaskTarget(
  target: CurrentTaskMediaTarget,
  request: CurrentTaskMediaRequest,
): Promise<CurrentTaskMediaReceipt> {
  assertFilePath(request.filePath, request.kind);
  await sendToChannel(target, request);
  return {
    ok: true,
    channel: target.platform,
    chatId: target.chatId,
    kind: request.kind,
    filePath: request.filePath,
  };
}
