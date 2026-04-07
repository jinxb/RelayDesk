import {
  buildScopedSessionOwnerId,
  createLogger,
  resolvePlatformAiCommand,
  setActiveRouteAnchor,
  type Config,
  type SessionManager,
} from "../../../state/src/index.js";
import {
  AccessControl,
  CommandHandler,
  RequestQueue,
  runAITask,
  setChatUser,
  startTaskCleanup,
  type TaskRunState,
  type ThreadContext,
} from "../../../interaction/src/index.js";
import {
  sendThinkingMessage,
  updateMessage,
  sendFinalMessages,
  sendFileReply,
  sendErrorMessage,
  sendTextReply,
  sendImageReply,
  sendDirectorySelection,
  startTypingLoop,
} from "./message-sender.js";
import type { QQMessageEvent } from "./types.js";
import { getAdapter } from "../../../agents/src/index.js";
import { buildQQAttachmentPrompt } from "./media.js";
import type { ChannelRuntimeServices } from "../runtime-services.js";

const log = createLogger("QQHandler");
const QQ_THROTTLE_MS = 1200;
const QQ_MIN_STREAM_DELTA_CHARS = 80;
const QQ_EVENT_DEDUP_TTL_MS = 5 * 60 * 1000;
const QQ_EVENT_FINGERPRINT_TTL_MS = 8 * 1000;

function buildQQScopeId(chatId: string, userId: string): string {
  return buildScopedSessionOwnerId({
    platform: "qq",
    chatId,
    userId,
  });
}

function toChatId(event: QQMessageEvent): string {
  if (event.type === "group") {
    return `group:${event.groupOpenid}`;
  }
  if (event.type === "channel") {
    return `channel:${event.channelId}`;
  }
  return `private:${event.userOpenid}`;
}

export interface QQEventHandlerHandle {
  stop: () => void;
  getRunningTaskCount: () => number;
  handleEvent: (event: QQMessageEvent) => Promise<void>;
}

export function setupQQHandlers(
  config: Config,
  sessionManager: SessionManager,
  services: ChannelRuntimeServices = {},
): QQEventHandlerHandle {
  const accessControl = new AccessControl(config.qqAllowedUserIds);
  const requestQueue = new RequestQueue();
  const runningTasks = new Map<string, TaskRunState>();
  const recentEventIds = new Map<string, number>();
  const recentEventFingerprints = new Map<string, number>();
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
    replyToMessageId?: string,
  ): Promise<"running" | "queued" | "rejected"> {
    const workDir = sessionManager.getWorkDir(scopeId);
    const convId = sessionManager.getConvId(scopeId);
    return requestQueue.enqueue(scopeId, convId, prompt, async (nextPrompt) => {
      await handleAIRequest(scopeId, chatId, nextPrompt, workDir, convId, undefined, replyToMessageId);
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
  ) {
    const aiCommand = resolvePlatformAiCommand(config, "qq");
    const toolAdapter = getAdapter(aiCommand);
    if (!toolAdapter) {
      await sendTextReply(chatId, `未配置 AI 工具：${aiCommand}`);
      return;
    }

    const sessionId = convId
      ? sessionManager.getSessionIdForConv(scopeId, convId, aiCommand)
      : undefined;
    const toolId = aiCommand;
    const msgId = await sendThinkingMessage(chatId, replyToMessageId, toolId);
    const stopTyping = startTypingLoop(chatId, replyToMessageId);
    const taskKey = `${scopeId}:${msgId}`;

    await runAITask(
      { config, sessionManager, currentTaskMediaHook: services.currentTaskMediaHook },
      { userId: scopeId, chatId, workDir, sessionId, convId, platform: "qq", taskKey },
      prompt,
      toolAdapter,
      {
        throttleMs: QQ_THROTTLE_MS,
        minContentDeltaChars: QQ_MIN_STREAM_DELTA_CHARS,
        streamUpdate: async (content, toolNote) => {
          await updateMessage(chatId, msgId, content, "streaming", toolNote, toolId);
        },
        sendComplete: async (content, note) => {
          await sendFinalMessages(chatId, msgId, content, note ?? "", toolId);
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
          await sendImageReply(chatId, path);
        },
        sendFile: async (path) => {
          await sendFileReply(chatId, path);
        },
      },
    );
  }

  function cleanupRecentEvents(now: number): void {
    for (const [eventId, timestamp] of recentEventIds) {
      if (now - timestamp > QQ_EVENT_DEDUP_TTL_MS) {
        recentEventIds.delete(eventId);
      }
    }

    for (const [fingerprint, timestamp] of recentEventFingerprints) {
      if (now - timestamp > QQ_EVENT_FINGERPRINT_TTL_MS) {
        recentEventFingerprints.delete(fingerprint);
      }
    }
  }

  function buildEventFingerprint(event: QQMessageEvent, chatId: string): string {
    const attachmentKey = (event.attachments ?? [])
      .map((attachment) => [
        attachment.url ?? "",
        attachment.filename ?? "",
        attachment.contentType ?? "",
        attachment.size ?? "",
      ].join("|"))
      .join(";");

    return [
      event.type,
      chatId,
      event.userOpenid,
      (event.content ?? "").trim(),
      attachmentKey,
    ].join("::");
  }

  async function handleEvent(event: QQMessageEvent): Promise<void> {
    const now = Date.now();
    cleanupRecentEvents(now);
    const eventId = event.id.trim();

    if (eventId) {
      if (recentEventIds.has(eventId)) {
        log.info(`Skipping duplicate QQ event: ${eventId}`);
        return;
      }
      recentEventIds.set(eventId, now);
    }

    const userId = event.userOpenid;
    const chatId = toChatId(event);
    const scopeId = buildQQScopeId(chatId, userId);
    const eventFingerprint = buildEventFingerprint(event, chatId);
    const text = event.content?.trim() ?? "";
    const attachmentPrompt = await buildQQAttachmentPrompt(event);

    if (!eventId) {
      if (recentEventFingerprints.has(eventFingerprint)) {
        log.info(`Skipping duplicate QQ event fingerprint without stable id: ${eventFingerprint}`);
        return;
      }
      recentEventFingerprints.set(eventFingerprint, now);
    }

    if (!accessControl.isAllowed(userId)) {
      await sendTextReply(chatId, `抱歉，您没有访问权限。\n您的 QQ 用户 ID：${userId}`);
      return;
    }

    setActiveRouteAnchor("qq", { chatId, userId });
    setChatUser(chatId, userId, "qq");

    if (text) {
      let handled = false;
      try {
        handled = await commandHandler.dispatch(text, chatId, scopeId, "qq", handleAIRequest);
      } catch (error) {
        log.error("Error in commandHandler.dispatch:", error);
        await sendTextReply(chatId, "命令执行失败，请重试。");
        return;
      }
      if (handled) return;
    } else if (!attachmentPrompt) {
      return;
    }

    const enqueueResult = await enqueuePrompt(
      scopeId,
      chatId,
      attachmentPrompt ?? text,
      event.id,
    );

    if (enqueueResult === "rejected") {
      await sendTextReply(chatId, "请求队列已满，请稍后再试。");
    } else if (enqueueResult === "queued") {
      await sendTextReply(chatId, "您的请求已排队等待。");
    }

    log.info(`QQ message handled: user=${userId}, chat=${chatId}, status=${enqueueResult}, attachments=${event.attachments?.length ?? 0}`);
  }

  return {
    stop: () => stopTaskCleanup(),
    getRunningTaskCount: () => runningTasks.size,
    handleEvent,
  };
}
