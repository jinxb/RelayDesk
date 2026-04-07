import { basename, win32 } from 'node:path';
import {
  sendMedia,
  sendProactiveText,
  uploadMedia,
} from './client.js';
import type { DingTalkStreamingTarget } from './client.js';
import {
  buildDirectoryMessage,
  RELAYDESK_SYSTEM_TITLE,
  buildDirectoryKeyboard,
  buildImageFallbackMessage,
  listDirectories,
  type ThreadContext,
} from '../../../interaction/src/index.js';
import {
  MAX_DINGTALK_MESSAGE_LENGTH,
  createLogger,
  type DingTalkActiveTarget,
} from '../../../state/src/index.js';
import {
  failDingTalkStream,
  finalizeDingTalkStream,
} from './message-delivery.js';
import {
  initializeDingTalkStream,
  sendTextWithRetry,
  updateDingTalkStream,
} from './message-flow.js';
import {
  configureDingTalkSenderSettings,
  generateMessageId,
  type SenderSettings,
} from './message-state.js';
import {
  formatDingTalkMessage,
  type MessageStatus,
} from './message-format.js';

const log = createLogger('DingTalkSender');
type NativeMediaKind = 'image' | 'file';

function resolveMediaFileName(filePath: string) {
  return filePath.includes('\\') ? win32.basename(filePath) : basename(filePath);
}

function buildFileFallbackMessage(filePath: string) {
  return `Generated file saved at: ${filePath}`;
}

function buildNativeMediaFallback(mediaType: NativeMediaKind, filePath: string) {
  if (mediaType === 'image') {
    return buildImageFallbackMessage('dingtalk', filePath);
  }
  return buildFileFallbackMessage(filePath);
}

function requireNativeTarget(target?: DingTalkStreamingTarget) {
  if (!target?.chatId || !target.robotCode) {
    throw new Error('DingTalk native media target unavailable');
  }
  return target;
}

async function sendNativeMediaReply(
  chatId: string,
  filePath: string,
  mediaType: NativeMediaKind,
  target?: DingTalkStreamingTarget,
) {
  try {
    const nativeTarget = requireNativeTarget(target);
    const fileName = resolveMediaFileName(filePath);
    const uploaded = await uploadMedia(filePath, mediaType);
    await sendMedia(nativeTarget, uploaded.mediaId, mediaType, fileName);
    log.info(`Native DingTalk ${mediaType} reply sent to chat ${chatId}`);
  } catch (error) {
    log.warn(`Failed to send native DingTalk ${mediaType} reply, falling back to text:`, error);
    await sendTextReply(chatId, buildNativeMediaFallback(mediaType, filePath));
  }
}

export function configureDingTalkMessageSender(settings: SenderSettings): void {
  configureDingTalkSenderSettings(settings);
}

export async function sendThinkingMessage(
  chatId: string,
  _replyToMessageId?: string,
  toolId = 'claude',
  target?: DingTalkStreamingTarget,
): Promise<string> {
  const messageId = generateMessageId();
  await initializeDingTalkStream({ chatId, messageId, toolId, target }, log);
  return messageId;
}

export async function updateMessage(
  chatId: string,
  messageId: string,
  content: string,
  status: MessageStatus,
  note?: string,
  toolId = 'claude',
): Promise<void> {
  void chatId;
  await updateDingTalkStream(messageId, content, status, note, toolId, log);
}

export async function sendFinalMessages(
  chatId: string,
  messageId: string,
  fullContent: string,
  note: string,
  toolId = 'claude',
): Promise<void> {
  await finalizeDingTalkStream(
    {
      chatId,
      messageId,
      fullContent,
      note,
      toolId,
      maxLength: MAX_DINGTALK_MESSAGE_LENGTH,
    },
    log,
  );
}

export async function sendErrorMessage(
  chatId: string,
  messageId: string,
  error: string,
  toolId = 'claude',
): Promise<void> {
  await failDingTalkStream(
    {
      chatId,
      messageId,
      error,
      toolId,
    },
    log,
  );
}

export async function sendTextReply(
  chatId: string,
  text: string,
  _threadCtx?: ThreadContext | string,
): Promise<void> {
  await sendTextWithRetry(
    chatId,
    formatDingTalkMessage(text, 'done', undefined, RELAYDESK_SYSTEM_TITLE),
    log,
  );
  log.info(`Text reply sent to DingTalk chat ${chatId}`);
}

export async function sendImageReply(
  chatId: string,
  imagePath: string,
  target?: DingTalkStreamingTarget,
): Promise<void> {
  await sendNativeMediaReply(chatId, imagePath, 'image', target);
}

export async function sendFileReply(
  chatId: string,
  filePath: string,
  target?: DingTalkStreamingTarget,
): Promise<void> {
  await sendNativeMediaReply(chatId, filePath, 'file', target);
}

export async function sendProactiveTextReply(
  target: string | DingTalkActiveTarget,
  text: string,
): Promise<void> {
  await sendProactiveText(
    target,
    formatDingTalkMessage(text, 'done', undefined, RELAYDESK_SYSTEM_TITLE),
  );
  const targetId = typeof target === 'string' ? target : target.chatId;
  log.info(`Proactive text sent to DingTalk chat ${targetId}`);
}

export async function sendDirectorySelection(
  chatId: string,
  currentDir: string,
  userId: string,
): Promise<void> {
  const directories = listDirectories(currentDir);
  const dirName = basename(currentDir) || currentDir;
  if (directories.length === 0) {
    await sendTextWithRetry(chatId, buildDirectoryMessage(dirName));
    return;
  }
  const keyboard = buildDirectoryKeyboard(directories, userId);
  const entries = keyboard.inline_keyboard
    .flat()
    .map((item) => item.text)
    .map((item) => `- ${item}`);
  await sendTextWithRetry(chatId, buildDirectoryMessage(dirName, entries));
}

export function startTypingLoop(_chatId: string): () => void {
  return () => {};
}
