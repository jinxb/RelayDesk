import type { DWClientDownStream } from 'dingtalk-stream';
import {
  buildScopedSessionOwnerId,
  createLogger,
  resolvePlatformAiCommand,
  setActiveChatId,
  setDingTalkActiveTarget,
  type Config,
  type SessionManager,
} from '../../../state/src/index.js';
import {
  AccessControl,
  CommandHandler,
  RequestQueue,
  buildUnsupportedInboundMessage,
  runAITask,
  setChatUser,
  startTaskCleanup,
  type TaskRunState,
  type ThreadContext,
} from '../../../interaction/src/index.js';
import {
  configureDingTalkMessageSender,
  sendThinkingMessage,
  updateMessage,
  sendFinalMessages,
  sendErrorMessage,
  sendFileReply,
  sendTextReply,
  sendImageReply,
  startTypingLoop,
  sendDirectorySelection,
} from './message-sender.js';
import { ackMessage, registerSessionWebhook } from './client.js';
import type { DingTalkStreamingTarget } from './client.js';
import { getAdapter } from '../../../agents/src/index.js';
import { isDuplicateDingTalkCallback } from "./inbound-dedupe.js";
import {
  buildDingTalkMediaPrompt,
  parseDingTalkRobotMessage,
  toDingTalkInboundKind,
  type DingTalkRobotPayload,
} from './media.js';
import type { ChannelRuntimeServices } from "../runtime-services.js";

const log = createLogger('DingTalkHandler');
const DINGTALK_THROTTLE_MS = 1000;

function buildDingTalkScopeId(chatId: string, userId: string): string {
  return buildScopedSessionOwnerId({
    platform: "dingtalk",
    chatId,
    userId,
  });
}

export interface DingTalkEventHandlerHandle {
  stop: () => void;
  getRunningTaskCount: () => number;
  handleEvent: (data: DWClientDownStream) => Promise<void>;
}

export function setupDingTalkHandlers(
  config: Config,
  sessionManager: SessionManager,
  services: ChannelRuntimeServices = {},
): DingTalkEventHandlerHandle {
  configureDingTalkMessageSender({
    cardTemplateId: config.dingtalkCardTemplateId,
    robotCodeFallback: config.dingtalkClientId,
  });
  if (config.dingtalkCardTemplateId) {
    log.info('DingTalk AI card streaming enabled');
  } else {
    log.info('DingTalk AI card streaming disabled: no cardTemplateId configured');
  }

  const accessControl = new AccessControl(config.dingtalkAllowedUserIds);
  const requestQueue = new RequestQueue();
  const runningTasks = new Map<string, TaskRunState>();
  const stopTaskCleanup = startTaskCleanup(runningTasks);

  const commandHandler = new CommandHandler({
    config,
    sessionManager,
    requestQueue,
    sender: { sendTextReply, sendDirectorySelection },
    getRunningTasksSize: () => runningTasks.size,
  });

  async function enqueuePrompt(
    scopeId: string,
    chatId: string,
    prompt: string,
    dingtalkTarget?: DingTalkStreamingTarget,
  ): Promise<'running' | 'queued' | 'rejected'> {
    const workDir = sessionManager.getWorkDir(scopeId);
    const convId = sessionManager.getConvId(scopeId);
    return requestQueue.enqueue(scopeId, convId, prompt, async (nextPrompt) => {
      await handleAIRequest(scopeId, chatId, nextPrompt, workDir, convId, undefined, undefined, dingtalkTarget);
    });
  }

  async function handleAIRequest(
    scopeId: string,
    chatId: string,
    prompt: string,
    workDir: string,
    convId?: string,
    _threadCtx?: ThreadContext,
    replyToMessageId?: string,
    dingtalkTarget?: DingTalkStreamingTarget,
  ) {
    log.info(`[AI_REQUEST] scopeId=${scopeId}, chatId=${chatId}, promptLength=${prompt.length}`);

    const aiCommand = resolvePlatformAiCommand(config, 'dingtalk');
    const toolAdapter = getAdapter(aiCommand);
    if (!toolAdapter) {
      await sendTextReply(chatId, `未配置 AI 工具：${aiCommand}`);
      return;
    }

    const sessionId = convId
      ? sessionManager.getSessionIdForConv(scopeId, convId, aiCommand)
      : undefined;
    log.info(`[AI_REQUEST] Running ${aiCommand} for scope ${scopeId}, sessionId=${sessionId ?? 'new'}`);

    const toolId = aiCommand;
    const msgId = await sendThinkingMessage(chatId, replyToMessageId, toolId, dingtalkTarget);
    const stopTyping = startTypingLoop(chatId);
    const taskKey = `${scopeId}:${msgId}`;

    await runAITask(
      { config, sessionManager, currentTaskMediaHook: services.currentTaskMediaHook },
      { userId: scopeId, chatId, workDir, sessionId, convId, platform: 'dingtalk', taskKey },
      prompt,
      toolAdapter,
      {
        throttleMs: DINGTALK_THROTTLE_MS,
        streamUpdate: async (content, toolNote) => {
          await updateMessage(chatId, msgId, content, 'streaming', toolNote, toolId);
        },
        sendComplete: async (content, note) => {
          await sendFinalMessages(chatId, msgId, content, note ?? '', toolId);
        },
        sendError: async (error) => {
          await sendErrorMessage(chatId, msgId, error, toolId);
        },
        extraCleanup: () => {
          stopTyping();
          runningTasks.delete(taskKey);
        },
        onTaskReady: (state) => {
          runningTasks.set(taskKey, state);
        },
        sendImage: async (path) => {
          await sendImageReply(chatId, path, dingtalkTarget);
        },
        sendFile: async (path) => {
          await sendFileReply(chatId, path, dingtalkTarget);
        },
      },
    );
  }

  async function handleEvent(data: DWClientDownStream): Promise<void> {
    const robotMessage = parseDingTalkRobotMessage(data);
    const callbackId = data.headers.messageId;

    if (isDuplicateDingTalkCallback(callbackId)) {
      log.info(`[MSG] Duplicate DingTalk callback ignored: ${callbackId}`);
      ackMessage(callbackId, { duplicate: true });
      return;
    }

    if (!robotMessage) {
      ackMessage(callbackId, { error: 'invalid payload' });
      return;
    }

    const message = robotMessage as DingTalkRobotPayload;
    const chatId = message.conversationId;
    const userId = message.senderStaffId || message.senderId;
    const scopeId = buildDingTalkScopeId(chatId, userId);
    const text = message.msgtype === 'text' ? message.text?.content?.trim() ?? '' : '';

    log.info(`[MSG] DingTalk message: type=${message.msgtype}, user=${userId}, chat=${chatId}`);

    if (!accessControl.isAllowed(userId)) {
      await sendTextReply(chatId, `抱歉，您没有访问权限。\n您的钉钉用户 ID：${userId}`);
      ackMessage(callbackId, { denied: true });
      return;
    }

    registerSessionWebhook(chatId, message.sessionWebhook);
    setActiveChatId('dingtalk', chatId);
    setDingTalkActiveTarget({
      chatId,
      userId,
      conversationType: message.conversationType,
      robotCode: message.robotCode || config.dingtalkClientId,
    });
    setChatUser(chatId, userId, 'dingtalk');

    const dingtalkTarget: DingTalkStreamingTarget = {
      chatId,
      conversationType: message.conversationType,
      senderStaffId: message.senderStaffId,
      senderId: message.senderId,
      robotCode: message.robotCode || config.dingtalkClientId,
    };

    if (message.msgtype !== 'text') {
      const kind = toDingTalkInboundKind(message.msgtype);
      const prompt = await buildDingTalkMediaPrompt(message, kind, config.dingtalkClientId);
      if (!prompt) {
        await sendTextReply(chatId, buildUnsupportedInboundMessage('dingtalk', kind));
        ackMessage(callbackId, { ignored: message.msgtype });
        return;
      }

      const enqueueResult = await enqueuePrompt(scopeId, chatId, prompt, dingtalkTarget);
      if (enqueueResult === 'rejected') {
        await sendTextReply(chatId, '请求队列已满，请稍后再试。');
      } else if (enqueueResult === 'queued') {
        await sendTextReply(chatId, '您的请求已排队等待。');
      }
      ackMessage(callbackId, { queued: enqueueResult, kind });
      return;
    }

    if (!text) {
      ackMessage(callbackId, { ignored: 'empty text' });
      return;
    }

    try {
      const handled = await commandHandler.dispatch(text, chatId, scopeId, 'dingtalk', handleAIRequest);
      if (handled) {
        ackMessage(callbackId, { handled: true });
        return;
      }
    } catch (err) {
      log.error('Error in commandHandler.dispatch:', err);
      await sendTextReply(chatId, '命令执行失败，请重试。');
      ackMessage(callbackId, { error: 'command dispatch failed' });
      return;
    }

    const enqueueResult = await enqueuePrompt(scopeId, chatId, text, dingtalkTarget);

    if (enqueueResult === 'rejected') {
      await sendTextReply(chatId, '请求队列已满，请稍后再试。');
    } else if (enqueueResult === 'queued') {
      await sendTextReply(chatId, '您的请求已排队等待。');
    }

    ackMessage(callbackId, { queued: enqueueResult });
  }

  return {
    stop: () => stopTaskCleanup(),
    getRunningTaskCount: () => runningTasks.size,
    handleEvent,
  };
}
