import {
  RELAYDESK_SYSTEM_TITLE,
  buildDirectoryMessage,
  buildCompletionSummary,
  buildImageFallbackMessage,
  buildMessageTitle,
  buildTextNote,
  splitLongContent,
} from "../../../interaction/src/index.js";
import { createLogger } from "../../../state/src/index.js";
import { getQQBot } from "./client.js";

const log = createLogger("QQSender");
const MAX_QQ_MESSAGE_LENGTH = 1500;
const QQ_TYPING_INTERVAL_MS = 45_000;
const QQ_THINKING_TEXT = "正在处理，请稍候。长任务可直接继续追问当前进度。";

interface PendingReplyState {
  replyToMessageId?: string;
}

const pendingReplies = new Map<string, PendingReplyState>();

type QQChatTarget =
  | { kind: "group"; id: string }
  | { kind: "private"; id: string }
  | { kind: "channel"; id: string };

function parseChatTarget(chatId: string): QQChatTarget {
  if (chatId.startsWith("group:")) {
    return { kind: "group", id: chatId.slice("group:".length) };
  }
  if (chatId.startsWith("channel:")) {
    return { kind: "channel", id: chatId.slice("channel:".length) };
  }
  if (chatId.startsWith("private:")) {
    return { kind: "private", id: chatId.slice("private:".length) };
  }
  return { kind: "private", id: chatId };
}

function supportsQQNativeMedia(target: QQChatTarget) {
  return target.kind === "private" || target.kind === "group";
}

function buildQQChannelImageFallback(imagePath: string) {
  return `QQ 频道当前不支持原生图片回传，已改为文本提示。图片已保存到: ${imagePath}`;
}

function buildQQChannelFileFallback(filePath: string) {
  return `QQ 频道当前不支持原生文件回传，已改为文本提示。文件已保存到: ${filePath}`;
}

async function sendRaw(chatId: string, text: string, replyToMessageId?: string): Promise<string | undefined> {
  const bot = getQQBot();
  const target = parseChatTarget(chatId);
  if (target.kind === "channel") {
    return bot.sendChannelMessage(target.id, text, replyToMessageId);
  }
  if (target.kind === "group") {
    return bot.sendGroupMessage(target.id, text, replyToMessageId);
  }
  return bot.sendPrivateMessage(target.id, text, replyToMessageId);
}

async function sendWithReplyFallback(
  chatId: string,
  text: string,
  replyToMessageId?: string,
): Promise<string | undefined> {
  if (!replyToMessageId) {
    return sendRaw(chatId, text);
  }

  try {
    return await sendRaw(chatId, text, replyToMessageId);
  } catch (error) {
    log.warn("QQ passive reply send failed, retrying as active message:", error);
    return sendRaw(chatId, text);
  }
}

async function sendNativeImage(chatId: string, imagePath: string): Promise<string | undefined> {
  const bot = getQQBot();
  const target = parseChatTarget(chatId);
  if (!supportsQQNativeMedia(target)) {
    return undefined;
  }
  if (target.kind === "group") {
    return bot.sendGroupImage(target.id, imagePath);
  }
  return bot.sendPrivateImage(target.id, imagePath);
}

async function sendNativeFile(chatId: string, filePath: string): Promise<string | undefined> {
  const bot = getQQBot();
  const target = parseChatTarget(chatId);
  if (!supportsQQNativeMedia(target)) {
    return undefined;
  }
  if (target.kind === "group") {
    return bot.sendGroupFile(target.id, filePath);
  }
  return bot.sendPrivateFile(target.id, filePath);
}

export async function sendTextReply(chatId: string, text: string): Promise<void> {
  try {
    const formatted = `${buildMessageTitle(RELAYDESK_SYSTEM_TITLE, "done")}\n\n${text}`;
    for (const part of splitLongContent(formatted, MAX_QQ_MESSAGE_LENGTH)) {
      await sendRaw(chatId, part);
    }
  } catch (error) {
    log.error("Failed to send QQ text reply:", error);
  }
}

export async function sendImageReply(chatId: string, imagePath: string): Promise<void> {
  const target = parseChatTarget(chatId);
  if (!supportsQQNativeMedia(target)) {
    await sendTextReply(chatId, buildQQChannelImageFallback(imagePath));
    return;
  }

  try {
    await sendNativeImage(chatId, imagePath);
  } catch (error) {
    log.error("Failed to send QQ image reply:", error);
    throw error;
  }
}

export async function sendFileReply(chatId: string, filePath: string): Promise<void> {
  const target = parseChatTarget(chatId);
  if (!supportsQQNativeMedia(target)) {
    await sendTextReply(chatId, buildQQChannelFileFallback(filePath));
    return;
  }

  try {
    await sendNativeFile(chatId, filePath);
  } catch (error) {
    log.error("Failed to send QQ file reply:", error);
    throw error;
  }
}

export async function sendThinkingMessage(chatId: string, replyToMessageId?: string, _toolId = "claude"): Promise<string> {
  const messageId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  pendingReplies.set(messageId, { replyToMessageId });
  await sendWithReplyFallback(
    chatId,
    `${buildMessageTitle(_toolId, "thinking")}\n${QQ_THINKING_TEXT}`,
    replyToMessageId,
  );
  return messageId;
}

export async function updateMessage(
  _chatId: string,
  _messageId: string,
  _content: string,
  _status: "thinking" | "streaming" | "done" | "error",
  _note?: string,
  _toolId = "claude",
): Promise<void> {
  // QQ 官方机器人接口不支持单条消息流式更新，这里显式忽略中间增量，只发送最终结果。
}

export async function sendFinalMessages(
  chatId: string,
  messageId: string,
  fullContent: string,
  note: string,
  toolId = "claude",
): Promise<void> {
  const replyToMessageId = pendingReplies.get(messageId)?.replyToMessageId;
  pendingReplies.delete(messageId);

  const completionText = note?.trim()
    ? `${fullContent}\n\n${buildTextNote(buildCompletionSummary(toolId, note))}`
    : fullContent;
  for (const part of splitLongContent(completionText, MAX_QQ_MESSAGE_LENGTH)) {
    await sendWithReplyFallback(chatId, part, replyToMessageId);
  }
}

export async function sendErrorMessage(chatId: string, messageId: string, error: string, toolId = "claude"): Promise<void> {
  const replyToMessageId = pendingReplies.get(messageId)?.replyToMessageId;
  pendingReplies.delete(messageId);
  await sendWithReplyFallback(chatId, `${buildMessageTitle(toolId, "error")}\n${error}`, replyToMessageId);
}

export async function sendDirectorySelection(chatId: string, currentDir: string): Promise<void> {
  await sendTextReply(chatId, buildDirectoryMessage(currentDir));
}


export function startTypingLoop(chatId?: string, replyToMessageId?: string): () => void {
  if (!chatId || !replyToMessageId || !chatId.startsWith("private:")) {
    return () => {};
  }

  const openid = chatId.slice("private:".length);
  const bot = getQQBot();

  const sendTyping = () => {
    bot.sendPrivateTyping(openid, replyToMessageId).catch((error) => {
      log.warn("Failed to send QQ typing notify:", error);
    });
  };

  sendTyping();
  const interval = setInterval(sendTyping, QQ_TYPING_INTERVAL_MS);
  return () => clearInterval(interval);
}
