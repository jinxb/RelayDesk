/**
 * WeWork (企业微信/WeCom) Message Sender
 * 通过 WebSocket `aibot_respond_msg` 发送消息，并透传 `req_id`
 */

import { sendText, sendStream, sendStreamWithItems, sendProactiveMessage, sendWebSocketReply, uploadWeWorkMedia } from './client.js';
import {
  buildDirectoryMessage,
  RELAYDESK_SYSTEM_TITLE,
  splitLongContent,
  type ThreadContext,
} from '../../../interaction/src/index.js';
import { createLogger, MAX_WEWORK_MESSAGE_LENGTH } from '../../../state/src/index.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  formatWeWorkMessage,
  getWeWorkToolTitle,
  type MessageStatus,
} from './message-format.js';
import {
  deleteStreamState,
  flushStreamUpdate,
  generateStreamId,
  getOrCreateStreamState,
  getReqId,
  getStreamState,
  setCurrentReqId,
  shouldFallbackToText,
  waitForStreamGap,
} from './stream-state.js';
import {
  buildGeneratedFileFallback,
  buildGeneratedFileLabel,
  buildNativeFileReplyBody,
  resolveGeneratedFileReply,
} from './native-media.js';

const log = createLogger('WeWorkSender');

export { setCurrentReqId };

/**
 * Send thinking message to WeWork.
 * Returns a stream ID that can be used for updates.
 * @param reqId 消息回调里的 `req_id`，用于通过 WebSocket 回复
 */
export async function sendThinkingMessage(
  chatId: string,
  _replyToMessageId: string | undefined,
  toolId = 'claude',
  reqId?: string
): Promise<string> {
  const streamId = generateStreamId();
  const title = getWeWorkToolTitle(toolId, 'thinking');
  const content = formatWeWorkMessage(title, '', 'thinking');

  try {
    log.info(`Sending thinking message to user ${chatId}, streamId=${streamId}`);

    getOrCreateStreamState(streamId, chatId);
    sendStream(getReqId(reqId, log), streamId, content, false);

    log.info(`Thinking message sent: ${streamId}`);
    return streamId;
  } catch (err) {
    log.error('Failed to send thinking message:', err);
    throw err;
  }
}

export async function updateMessage(
  chatId: string,
  streamId: string,
  content: string,
  status: MessageStatus,
  note?: string,
  toolId = 'claude',
  reqId?: string
): Promise<void> {
  const title = getWeWorkToolTitle(toolId, status);
  const message = formatWeWorkMessage(title, content, status, note);
  const state = getOrCreateStreamState(streamId, chatId);

  try {
    state.chatId = chatId;
    state.content = content;
    if (state.closed) return;

    if (shouldFallbackToText(state)) {
      state.expired = true;
      return;
    }

    state.pendingUpdate = { message, status, reqId };
    await flushStreamUpdate(streamId, state, log);
  } catch (err) {
    log.error('Failed to update message:', err);
    throw err;
  }
}

export async function sendFinalMessages(
  chatId: string,
  streamId: string,
  fullContent: string,
  note: string,
  toolId = 'claude',
  reqId?: string
): Promise<void> {
  const contentToSend = fullContent?.trim() || '(无输出)';
  const reqIdUsed = getReqId(reqId, log);
  if (!reqIdUsed) {
    log.warn(`sendFinalMessages: no req_id, streamId=${streamId}, contentLen=${contentToSend.length}`);
  }
  log.info(`sendFinalMessages: streamId=${streamId}, contentLen=${contentToSend.length}, reqId=${reqIdUsed ? 'ok' : 'missing'}`);
  const title = getWeWorkToolTitle(toolId, 'done');
  const parts = splitLongContent(contentToSend, MAX_WEWORK_MESSAGE_LENGTH);
  const finalMessage = formatWeWorkMessage(
    title,
    parts[0],
    'done',
    parts.length > 1 ? `内容较长，已分段发送 (1/${parts.length})` : note,
    toolId,
  );

  try {
    const state = getStreamState(streamId);
    const shouldSendTextFallback = shouldFallbackToText(state);

    if (!shouldSendTextFallback && state && contentToSend.length > 0) {
      // 先发一条「输出中」带正文，再发 finish 的最终条，避免企微端一直停在「思考中」不刷新
      await updateMessage(chatId, streamId, contentToSend, 'streaming', note, toolId, reqId);
    }

    if (state) {
      state.closed = true;
      state.pendingUpdate = undefined;
    }

    if (!shouldSendTextFallback) {
      await waitForStreamGap(state);
      sendStream(getReqId(reqId, log), streamId, finalMessage, true);
      log.info(`Final stream message sent, streamId=${streamId}`);
    } else {
      sendText(getReqId(reqId, log), finalMessage);
      log.info(`Final stream expired, sent text fallback instead: streamId=${streamId}`);
    }

    deleteStreamState(streamId);

    for (let i = 1; i < parts.length; i++) {
      try {
        const partContent = `${parts[i]}\n\n_*(续 ${i + 1}/${parts.length})*_`;
        const partMessage = formatWeWorkMessage(
          title,
          partContent,
          'done',
          i === parts.length - 1 ? note : undefined,
          toolId,
        );

        sendText(getReqId(reqId, log), partMessage);
        log.info(`Final message part ${i + 1}/${parts.length} sent`);
      } catch (err) {
        log.error(`Failed to send part ${i + 1}:`, err);
      }
    }
  } catch (err) {
    log.error('Failed to send final messages:', err);
  }
}

/**
 * 主动推送文本，用于启动/关闭通知等场景，无需 req_id。
 */
export async function sendProactiveTextReply(chatId: string, text: string): Promise<void> {
  const message = formatWeWorkMessage(RELAYDESK_SYSTEM_TITLE, text, 'done');
  try {
    sendProactiveMessage(chatId, message);
    log.info(`Proactive text sent to user ${chatId}`);
  } catch (err) {
    log.error('Failed to send proactive text:', err);
  }
}

/**
 * Send simple text reply to WeWork.
 * @param threadCtxOrReqId 兼容 MessageSender 的 threadCtx；若为 string 则作为 reqId 使用
 */
export async function sendTextReply(
  chatId: string,
  text: string,
  threadCtxOrReqId?: ThreadContext | string
): Promise<void> {
  const message = formatWeWorkMessage(RELAYDESK_SYSTEM_TITLE, text, 'done');
  const explicitReqId = typeof threadCtxOrReqId === 'string' ? threadCtxOrReqId : undefined;

  try {
    sendText(getReqId(explicitReqId, log), message);
    log.info(`Text reply sent to user ${chatId}`);
  } catch (err) {
    log.error('Failed to send text reply:', err);
  }
}


export async function sendImageReply(
  chatId: string,
  imagePath: string,
  reqId?: string,
): Promise<void> {
  try {
    const resolvedReqId = getReqId(reqId, log);
    if (!resolvedReqId) {
      await sendTextReply(chatId, `Generated image saved at: ${imagePath}`);
      return;
    }

    const imageBuffer = await readFile(imagePath);
    const base64 = imageBuffer.toString('base64');
    const md5 = createHash('md5').update(imageBuffer).digest('hex');
    sendStreamWithItems(resolvedReqId, generateStreamId(), 'Generated image', true, [
      {
        msgtype: 'image',
        image: { base64, md5 },
      },
    ]);
  } catch (err) {
    log.warn('Failed to send native WeWork image reply, falling back to text path:', err);
    await sendTextReply(chatId, `Generated image saved at: ${imagePath}`);
  }
}

export async function sendFileReply(
  chatId: string,
  filePath: string,
  reqId?: string,
): Promise<void> {
  const { fileName, mediaType } = resolveGeneratedFileReply(filePath);
  const progressLabel = buildGeneratedFileLabel(mediaType, fileName);
  const fallbackMessage = buildGeneratedFileFallback(mediaType, filePath);
  let resolvedReqId: string | undefined;
  let streamId: string | undefined;
  let streamOpened = false;
  let streamClosed = false;

  try {
    resolvedReqId = getReqId(reqId, log);
    if (!resolvedReqId) {
      await sendTextReply(chatId, fallbackMessage);
      return;
    }

    streamId = generateStreamId();
    sendStream(resolvedReqId, streamId, progressLabel, false);
    streamOpened = true;
    const uploaded = await uploadWeWorkMedia(filePath, mediaType, fileName);
    sendWebSocketReply(resolvedReqId, buildNativeFileReplyBody(mediaType, uploaded.mediaId));
    sendStream(resolvedReqId, streamId, progressLabel, true);
    streamClosed = true;
  } catch (err) {
    log.warn('Failed to send native WeWork file reply, falling back to text path:', err);
    if (resolvedReqId && streamId && streamOpened && !streamClosed) {
      try {
        sendStream(resolvedReqId, streamId, progressLabel, true);
      } catch (streamError) {
        log.warn('Failed to close native WeWork file progress stream after reply failure:', streamError);
      }
    }
    await sendTextReply(chatId, fallbackMessage);
  }
}

export async function sendDirectorySelection(
  chatId: string,
  currentDir: string,
  _userId: string
): Promise<void> {
  await sendTextReply(chatId, buildDirectoryMessage(currentDir));
}

export function startTypingLoop(_chatId: string): () => void {
  return () => {};
}

export async function sendErrorMessage(chatId: string, error: string, reqId?: string): Promise<void> {
  const message = formatWeWorkMessage('错误', error, 'error');

  try {
    sendText(getReqId(reqId, log), message);
    log.info(`Error message sent to user ${chatId}`);
  } catch (err) {
    log.error('Failed to send error message:', err);
  }
}
