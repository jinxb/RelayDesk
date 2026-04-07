import { randomBytes } from "node:crypto";
import {
  buildCompletionSummary,
  RELAYDESK_SYSTEM_TITLE,
  buildDirectoryMessage,
  buildImageFallbackMessage,
  buildMessageTitle,
  splitLongContent,
} from "../../../interaction/src/index.js";
import { createLogger } from "../../../state/src/index.js";
import {
  sendWeChatTextMessage,
  sendWeChatTypingStatus,
} from "./api.js";
import {
  getWeChatContextToken,
  getWeChatRuntimeConfig,
  getWeChatTypingTicket,
  refreshWeChatTypingTicket,
} from "./runtime.js";
import {
  resolveWeChatGeneratedMediaKind,
  sendWeChatNativeMediaFile,
} from "./send-media.js";

const log = createLogger("WeChatSender");
const MAX_WECHAT_MESSAGE_LENGTH = 1200;
const WECHAT_TYPING_INTERVAL_MS = 15_000;

function createClientId() {
  return randomBytes(8).toString("hex");
}

function formatWeChatMessage(
  content: string,
  status: "done" | "error",
  toolId = RELAYDESK_SYSTEM_TITLE,
  note?: string,
) {
  if (status === "done" && toolId !== RELAYDESK_SYSTEM_TITLE) {
    const summary = buildCompletionSummary(toolId, note);
    return summary ? `${content}\n\n${summary}` : content;
  }

  const title = buildMessageTitle(toolId, status);
  const cleanedNote = note?.trim();
  return cleanedNote
    ? `${title}\n${content}\n\n${cleanedNote}`
    : `${title}\n${content}`;
}

async function sendWeChatChunks(chatId: string, text: string): Promise<void> {
  const { baseUrl, token } = getWeChatRuntimeConfig();
  for (const part of splitLongContent(text, MAX_WECHAT_MESSAGE_LENGTH)) {
    await sendWeChatTextMessage({
      baseUrl,
      token,
      toUserId: chatId,
      text: part,
      clientId: createClientId(),
      contextToken: getWeChatContextToken(chatId),
    });
  }
}

async function ensureTypingTicket(chatId: string): Promise<string | undefined> {
  return getWeChatTypingTicket(chatId) ?? refreshWeChatTypingTicket(chatId);
}

async function pushTypingStatus(
  chatId: string,
  status: 1 | 2,
  ticket?: string,
): Promise<string | undefined> {
  const typingTicket = ticket ?? await ensureTypingTicket(chatId);
  if (!typingTicket) {
    return undefined;
  }
  const { baseUrl, token } = getWeChatRuntimeConfig();
  await sendWeChatTypingStatus({
    baseUrl,
    token,
    ilinkUserId: chatId,
    typingTicket,
    status,
  });
  return typingTicket;
}

export async function sendThinkingMessage(
  _chatId: string,
  _replyToMessageId: string | undefined,
  _toolId = 'claude',
): Promise<string> {
  return createClientId();
}

export async function updateMessage(
  _chatId: string,
  _messageId: string,
  _content: string,
  _status: "thinking" | "streaming" | "done" | "error",
  _note?: string,
  _toolId = 'claude',
): Promise<void> {
  // WeChat ilink transport currently sends only final text replies; it does not support
  // in-place message edits for streamed intermediate content.
}

export async function sendFinalMessages(
  chatId: string,
  _messageId: string,
  fullContent: string,
  note: string,
  toolId = 'claude',
): Promise<void> {
  await sendWeChatChunks(chatId, formatWeChatMessage(fullContent, "done", toolId, note));
}

export async function sendTextReply(chatId: string, text: string): Promise<void> {
  await sendWeChatChunks(chatId, formatWeChatMessage(text, "done"));
}

export async function sendImageReply(chatId: string, imagePath: string): Promise<void> {
  try {
    const { baseUrl, token } = getWeChatRuntimeConfig();
    await sendWeChatNativeMediaFile({
      baseUrl,
      token,
      toUserId: chatId,
      clientId: createClientId(),
      contextToken: getWeChatContextToken(chatId),
      filePath: imagePath,
    });
  } catch (error) {
    log.warn("Failed to send native WeChat image reply, falling back to text path:", error);
    await sendTextReply(chatId, buildImageFallbackMessage("wechat", imagePath));
  }
}

export async function sendFileReply(chatId: string, filePath: string): Promise<void> {
  const kind = resolveWeChatGeneratedMediaKind(filePath);
  if (kind === "voice") {
    await sendTextReply(chatId, `Generated voice saved at: ${filePath}`);
    return;
  }

  try {
    const { baseUrl, token } = getWeChatRuntimeConfig();
    await sendWeChatNativeMediaFile({
      baseUrl,
      token,
      toUserId: chatId,
      clientId: createClientId(),
      contextToken: getWeChatContextToken(chatId),
      filePath,
    });
  } catch (error) {
    log.warn("Failed to send native WeChat file reply, falling back to text path:", error);
    await sendTextReply(chatId, `Generated ${kind} saved at: ${filePath}`);
  }
}

export async function sendDirectorySelection(
  chatId: string,
  currentDir: string,
): Promise<void> {
  await sendTextReply(chatId, buildDirectoryMessage(currentDir));
}

export function startTypingLoop(chatId: string): () => void {
  let stopped = false;
  let typingTicket: string | undefined;

  const sendStatus = async (status: 1 | 2) => {
    try {
      typingTicket = await pushTypingStatus(chatId, status, typingTicket);
    } catch (error) {
      log.warn("Failed to send WeChat typing status:", error);
    }
  };

  void sendStatus(1);
  const interval = setInterval(() => {
    if (!stopped) {
      void sendStatus(1);
    }
  }, WECHAT_TYPING_INTERVAL_MS);

  return () => {
    stopped = true;
    clearInterval(interval);
    if (typingTicket) {
      void sendStatus(2);
    }
  };
}

export async function sendErrorMessage(chatId: string, error: string, toolId = 'claude'): Promise<void> {
  await sendWeChatChunks(chatId, formatWeChatMessage(error, "error", toolId));
}
