import type { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import {
  TELEGRAM_THROTTLE_MS,
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
  buildErrorNote,
  buildMediaContext,
  buildProgressNote,
  buildSavedMediaPrompt,
  downloadMediaFromUrl,
  escapePathForMarkdown,
  runAITask,
  setChatUser,
  startTaskCleanup,
  type TaskRunState,
} from "../../../interaction/src/index.js";
import {
  sendThinkingMessage,
  updateMessage,
  sendFinalMessages,
  sendFileReply,
  sendTextReply,
  startTypingLoop,
  sendImageReply,
  sendDirectorySelection,
} from "./message-sender.js";
import { getAdapter } from "../../../agents/src/index.js";
import { resolveTelegramDirectoryCallbackData } from "./directory-actions.js";
import { createTelegramStreamUpdater } from "./stream-updater.js";
import type { ChannelRuntimeServices } from "../runtime-services.js";

const log = createLogger("TgHandler");

interface TelegramStopAction {
  kind: "stop";
  messageId: string;
}

interface TelegramDirectoryAction {
  kind: "cd";
  userId: string;
  path: string;
}

type TelegramControlAction = TelegramStopAction | TelegramDirectoryAction;

export function parseTelegramControlAction(
  data: string,
): TelegramControlAction | null {
  if (data.startsWith("stop_")) {
    return {
      kind: "stop",
      messageId: data.replace("stop_", ""),
    };
  }

  if (data.startsWith("cd:")) {
    const [, userId, encodedPath] = data.split(":", 3);
    if (!(userId && encodedPath)) {
      return null;
    }

    try {
      return {
        kind: "cd",
        userId,
        path: decodeURIComponent(encodedPath),
      };
    } catch {
      return null;
    }
  }

  const resolved = resolveTelegramDirectoryCallbackData(data);
  if (resolved) {
    return {
      kind: "cd",
      userId: resolved.userId,
      path: resolved.path,
    };
  }

  return null;
}

export function extractThinkingTextUpdate(content: string): string | null {
  const match = /^(?:ℹ️ 上下文模式：[^\n]+\n\n)?💭 \*\*.+ 思考中\.\.\.\*\*\n\n([\s\S]*)$/.exec(content);
  if (!match) {
    return null;
  }
  return match[1] ?? "";
}

class DynamicThrottle {
  private lastUpdate = 0;
  private lastContentLength = 0;
  private consecutiveErrors = 0;
  private baseInterval = TELEGRAM_THROTTLE_MS;

  getNextDelay(contentLength: number): number {
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastUpdate;

    if (this.consecutiveErrors > 0) {
      const errorDelay = this.baseInterval * (1 + this.consecutiveErrors * 2);
      this.lastUpdate = now;
      return errorDelay;
    }

    const contentGrowth = contentLength - this.lastContentLength;
    if (contentGrowth < 50 && timeSinceLastUpdate < 500) {
      this.lastUpdate = now;
      return 500;
    }

    this.lastUpdate = now;
    this.lastContentLength = contentLength;
    return this.baseInterval;
  }

  recordError(): void {
    this.consecutiveErrors++;
    this.lastUpdate = Date.now();
  }

  recordSuccess(): void {
    this.consecutiveErrors = 0;
  }

  reset(): void {
    this.lastUpdate = 0;
    this.lastContentLength = 0;
    this.consecutiveErrors = 0;
  }
}

function buildTelegramScopeId(chatId: string, userId: string, threadId?: string): string {
  return buildScopedSessionOwnerId({
    platform: "telegram",
    chatId,
    userId,
    threadId,
  });
}

async function downloadTelegramPhoto(
  bot: Telegraf,
  fileId: string,
): Promise<string> {
  return downloadTelegramFile(bot, fileId, fileId, "jpg");
}

async function downloadTelegramFile(
  bot: Telegraf,
  fileId: string,
  basenameHint: string,
  fallbackExtension: string,
): Promise<string> {
  const fileLink = await bot.telegram.getFileLink(fileId);
  const safeId = basenameHint.replace(/[^a-zA-Z0-9._-]/g, "_");
  return downloadMediaFromUrl(fileLink.href, {
    basenameHint: safeId,
    fallbackExtension,
  });
}

export interface TelegramEventHandlerHandle {
  stop: () => void;
  getRunningTaskCount: () => number;
}

export function setupTelegramHandlers(
  bot: Telegraf,
  config: Config,
  sessionManager: SessionManager,
  services: ChannelRuntimeServices = {},
): TelegramEventHandlerHandle {
  const accessControl = new AccessControl(config.telegramAllowedUserIds);
  const requestQueue = new RequestQueue();
  const runningTasks = new Map<string, TaskRunState>();
  const drainStreamingTasks = new Map<string, () => Promise<void>>();
  const stopTaskCleanup = startTaskCleanup(runningTasks);

  const commandHandler = new CommandHandler({
    config,
    sessionManager,
    requestQueue,
    sender: { sendTextReply, sendDirectorySelection },
    getRunningTasksSize: () => runningTasks.size,
  });

  async function enqueueSavedMedia(
    scopeId: string,
    chatId: string,
    kind: string,
    localPath: string,
    text?: string,
  ): Promise<"running" | "queued" | "rejected"> {
    const prompt = buildSavedMediaPrompt({
      source: "Telegram",
      kind,
      localPath,
      text,
    });
    const workDir = sessionManager.getWorkDir(scopeId);
    const convId = sessionManager.getConvId(scopeId);
    return requestQueue.enqueue(scopeId, convId, prompt, async (nextPrompt) => {
      await handleAIRequest(scopeId, chatId, nextPrompt, workDir, convId);
    });
  }

  async function handleAIRequest(
    scopeId: string,
    chatId: string,
    prompt: string,
    workDir: string,
    convId?: string,
    _threadCtx?: { rootMessageId: string; threadId: string },
    replyToMessageId?: string,
  ) {
    const aiCommand = resolvePlatformAiCommand(config, "telegram");
    const toolAdapter = getAdapter(aiCommand);
    if (!toolAdapter) {
      await sendTextReply(chatId, `未配置 AI 工具: ${aiCommand}`);
      return;
    }

    const sessionId = convId
      ? sessionManager.getSessionIdForConv(scopeId, convId, aiCommand)
      : undefined;
    log.info(
      `Running ${aiCommand} for scope ${scopeId}, sessionId=${sessionId ?? "new"}`,
    );

    const toolId = aiCommand;
    let msgId: string;
    try {
      msgId = await sendThinkingMessage(chatId, replyToMessageId, toolId);
    } catch (err) {
      log.error("Failed to send thinking message:", err);
      return;
    }

    const stopTyping = startTypingLoop(chatId);
    const taskKey = `${scopeId}:${msgId}`;
    const throttle = new DynamicThrottle();

    let savedThinkingText = "";
    let hasThinkingContent = false;

    function formatStreamingContent(content: string) {
      const STREAM_PREVIEW_LENGTH = 1500;
      if (hasThinkingContent && savedThinkingText) {
        const thinkingFormatted = `💭 思考过程：\n${savedThinkingText}`;
        const separator = "\n\n─────────\n\n";
        const combined = thinkingFormatted + separator + content;

        if (combined.length <= STREAM_PREVIEW_LENGTH) {
          return combined;
        }

        const maxThinkingLength = 800;
        const truncatedThinking =
          savedThinkingText.length > maxThinkingLength
            ? `...(已省略 ${savedThinkingText.length - maxThinkingLength} 字符)...\n\n${savedThinkingText.slice(-maxThinkingLength)}`
            : savedThinkingText;

        let displayContent = `💭 思考过程：\n${truncatedThinking}\n\n─────────\n\n`;
        displayContent +=
          content.length > 800 ? `...\n\n${content.slice(-800)}` : content;
        return displayContent;
      }

      return content.length > STREAM_PREVIEW_LENGTH
        ? `...\n\n${content.slice(-STREAM_PREVIEW_LENGTH)}`
        : content;
    }

    const streamUpdater = createTelegramStreamUpdater({
      sendUpdate: async (content, toolNote) => {
        const note = buildProgressNote(toolNote);
        await updateMessage(chatId, msgId, content, "streaming", note, toolId);
      },
      getDelay: (contentLength) => throttle.getNextDelay(contentLength),
      onSuccess: () => {
        throttle.recordSuccess();
      },
      onError: () => {
        throttle.recordError();
      },
    });

    const streamUpdateWrapper = (content: string, toolNote?: string) => {
      const thinkingText = extractThinkingTextUpdate(content);
      if (thinkingText !== null) {
        savedThinkingText = thinkingText;
        hasThinkingContent = thinkingText.trim().length > 0;
        return;
      }

      streamUpdater.schedule(formatStreamingContent(content), toolNote);
    };

    await runAITask(
      { config, sessionManager, currentTaskMediaHook: services.currentTaskMediaHook },
      {
        userId: scopeId,
        chatId,
        workDir,
        sessionId,
        convId,
        platform: "telegram",
        taskKey,
      },
      prompt,
      toolAdapter,
      {
        throttleMs: TELEGRAM_THROTTLE_MS,
        streamUpdate: (content, toolNote) => {
          streamUpdateWrapper(content, toolNote);
        },
        sendComplete: async (content, note) => {
          throttle.reset();
          await streamUpdater.finish();
          try {
            await sendFinalMessages(chatId, msgId, content, note, toolId);
          } catch (err) {
            log.error("Failed to send complete message:", err);
            await updateMessage(chatId, msgId, content, "done", note, toolId);
          }
        },
        sendError: async (error) => {
          throttle.reset();
          await streamUpdater.finish();
          await updateMessage(
            chatId,
            msgId,
            `错误：${error}`,
            "error",
            buildErrorNote(),
            toolId,
          );
        },
        extraCleanup: () => {
          throttle.reset();
          savedThinkingText = "";
          hasThinkingContent = false;
          stopTyping();
          streamUpdater.reset();
          runningTasks.delete(taskKey);
          drainStreamingTasks.delete(taskKey);
        },
        onTaskReady: (state) => {
          runningTasks.set(taskKey, state);
          drainStreamingTasks.set(taskKey, () => streamUpdater.finish());
        },
        sendImage: (path) => sendImageReply(chatId, path),
        sendFile: (path) => sendFileReply(chatId, path),
      },
    );
  }

  bot.on("callback_query", async (ctx) => {
    const query = ctx.callbackQuery;
    if (!("data" in query)) return;
    const userId = String(ctx.from?.id ?? "");
    const scopeId = buildTelegramScopeId(String(ctx.chat?.id ?? ""), userId);
    const data = query.data as string;
    const action = parseTelegramControlAction(data);
    if (!action) {
      return;
    }

    if (action.kind === "stop") {
      const messageId = action.messageId;
      const taskKey = `${scopeId}:${messageId}`;
      const taskInfo = runningTasks.get(taskKey);
      const drainStreaming = drainStreamingTasks.get(taskKey);
      if (taskInfo) {
        runningTasks.delete(taskKey);
        drainStreamingTasks.delete(taskKey);
        taskInfo.settle();
        taskInfo.handle.abort();
        await drainStreaming?.();
        const chatId = String(ctx.chat?.id ?? "");
        await updateMessage(
          chatId,
          messageId,
          taskInfo.latestContent || "已停止",
          "error",
          "⏹️ 已停止",
          taskInfo.toolId,
        );
        await ctx.answerCbQuery("已停止执行");
      } else {
        await ctx.answerCbQuery("任务已完成或不存在");
      }
      return;
    }

    const chatId = String(ctx.chat?.id ?? "");
    const currentScopeId = buildTelegramScopeId(chatId, userId);
    if (action.userId !== userId && action.userId !== currentScopeId) {
      await ctx.answerCbQuery("这个目录选择不属于当前用户");
      return;
    }

    try {
      const resolved = await sessionManager.setWorkDir(currentScopeId, action.path);
      await sendTextReply(
        chatId,
        `📁 工作目录已切换到: ${escapePathForMarkdown(resolved)}\n\n🔄 AI 会话已重置，下一条消息将使用全新上下文。`,
      );
      await ctx.answerCbQuery("已切换目录");
    } catch (error) {
      await sendTextReply(
        chatId,
        error instanceof Error ? error.message : String(error),
      );
      await ctx.answerCbQuery("目录切换失败");
    }
  });

  bot.on(message("text"), async (ctx) => {
    const chatId = String(ctx.chat.id);
    const userId = String(ctx.from!.id);
    const scopeId = buildTelegramScopeId(chatId, userId);
    const messageId = String(ctx.message.message_id);
    const text = ctx.message.text.trim();

    if (!accessControl.isAllowed(userId)) {
      await sendTextReply(chatId, "抱歉，您没有访问权限。\n您的 ID: " + userId);
      return;
    }

    setActiveRouteAnchor("telegram", { chatId, userId });
    setChatUser(chatId, userId, "telegram");

    try {
      if (
        await commandHandler.dispatch(
          text,
          chatId,
          scopeId,
          "telegram",
          handleAIRequest,
        )
      ) {
        return;
      }
    } catch (err) {
      log.error("Error in commandHandler.dispatch:", err);
      await sendTextReply(chatId, "命令执行失败，请重试。");
      return;
    }

    const workDir = sessionManager.getWorkDir(scopeId);
    const convId = sessionManager.getConvId(scopeId);
    const enqueueResult = requestQueue.enqueue(
      scopeId,
      convId,
      text,
      async (prompt) => {
        await handleAIRequest(
          scopeId,
          chatId,
          prompt,
          workDir,
          convId,
          undefined,
          messageId,
        );
      },
    );

    if (enqueueResult === "rejected") {
      await sendTextReply(chatId, "请求队列已满，请稍后再试。");
    } else if (enqueueResult === "queued") {
      await sendTextReply(chatId, "您的请求已排队等待。");
    }
  });

  bot.on(message("photo"), async (ctx) => {
    const chatId = String(ctx.chat.id);
    const userId = String(ctx.from!.id);
    const scopeId = buildTelegramScopeId(chatId, userId);
    const caption = ctx.message.caption?.trim() || "";

    if (!accessControl.isAllowed(userId)) return;

    setActiveRouteAnchor("telegram", { chatId, userId });
    setChatUser(chatId, userId, "telegram");

    const photos = ctx.message.photo;
    const largest = photos[photos.length - 1];
    const contextText = buildMediaContext({
      Width: largest.width,
      Height: largest.height,
    }, caption ? `Caption: ${caption}` : undefined);
    let imagePath: string;
    try {
      imagePath = await downloadTelegramPhoto(bot, largest.file_id);
    } catch (err) {
      log.error("Failed to download photo:", err);
      await sendTextReply(chatId, "图片下载失败。");
      return;
    }

    const enqueueResult = await enqueueSavedMedia(scopeId, chatId, "image", imagePath, contextText);
    if (enqueueResult === "rejected") {
      await sendTextReply(chatId, "请求队列已满，请稍后再试。");
    } else if (enqueueResult === "queued") {
      await sendTextReply(chatId, "您的请求已排队等待。");
    }
  });

  bot.on(message("document"), async (ctx) => {
    const chatId = String(ctx.chat.id);
    const userId = String(ctx.from!.id);
    const scopeId = buildTelegramScopeId(chatId, userId);
    const caption = ctx.message.caption?.trim() || "";

    if (!accessControl.isAllowed(userId)) return;

    setActiveRouteAnchor("telegram", { chatId, userId });
    setChatUser(chatId, userId, "telegram");

    try {
      const document = ctx.message.document;
      const contextText = buildMediaContext({
        Filename: document.file_name,
        MimeType: document.mime_type,
        Size: document.file_size,
      }, caption ? `Caption: ${caption}` : undefined);
      const path = await downloadTelegramFile(
        bot,
        document.file_id,
        document.file_name ?? document.file_id,
        "bin",
      );
      const enqueueResult = await enqueueSavedMedia(scopeId, chatId, "document", path, contextText);
      if (enqueueResult === "rejected") {
        await sendTextReply(chatId, "请求队列已满，请稍后再试。");
      } else if (enqueueResult === "queued") {
        await sendTextReply(chatId, "您的请求已排队等待。");
      }
    } catch (err) {
      log.error("Failed to download document:", err);
      await sendTextReply(chatId, "文档下载失败。");
    }
  });

  bot.on(message("audio"), async (ctx) => {
    const chatId = String(ctx.chat.id);
    const userId = String(ctx.from!.id);
    const scopeId = buildTelegramScopeId(chatId, userId);
    const caption = ctx.message.caption?.trim() || "";

    if (!accessControl.isAllowed(userId)) return;

    setActiveRouteAnchor("telegram", { chatId, userId });
    setChatUser(chatId, userId, "telegram");

    try {
      const audio = ctx.message.audio;
      const contextText = buildMediaContext({
        Filename: audio.file_name,
        Title: audio.title,
        Performer: audio.performer,
        DurationSeconds: audio.duration,
        MimeType: audio.mime_type,
      }, caption ? `Caption: ${caption}` : undefined);
      const path = await downloadTelegramFile(
        bot,
        audio.file_id,
        audio.file_name ?? audio.file_id,
        "mp3",
      );
      const enqueueResult = await enqueueSavedMedia(scopeId, chatId, "audio", path, contextText);
      if (enqueueResult === "rejected") {
        await sendTextReply(chatId, "请求队列已满，请稍后再试。");
      } else if (enqueueResult === "queued") {
        await sendTextReply(chatId, "您的请求已排队等待。");
      }
    } catch (err) {
      log.error("Failed to download audio:", err);
      await sendTextReply(chatId, "音频下载失败。");
    }
  });

  bot.on(message("voice"), async (ctx) => {
    const chatId = String(ctx.chat.id);
    const userId = String(ctx.from!.id);
    const scopeId = buildTelegramScopeId(chatId, userId);

    if (!accessControl.isAllowed(userId)) return;

    setActiveRouteAnchor("telegram", { chatId, userId });
    setChatUser(chatId, userId, "telegram");

    try {
      const voice = ctx.message.voice;
      const contextText = buildMediaContext({
        DurationSeconds: voice.duration,
        MimeType: voice.mime_type,
      });
      const path = await downloadTelegramFile(
        bot,
        voice.file_id,
        voice.file_unique_id ?? voice.file_id,
        "ogg",
      );
      const enqueueResult = await enqueueSavedMedia(scopeId, chatId, "voice", path, contextText);
      if (enqueueResult === "rejected") {
        await sendTextReply(chatId, "请求队列已满，请稍后再试。");
      } else if (enqueueResult === "queued") {
        await sendTextReply(chatId, "您的请求已排队等待。");
      }
    } catch (err) {
      log.error("Failed to download voice message:", err);
      await sendTextReply(chatId, "语音下载失败。");
    }
  });

  bot.on(message("video"), async (ctx) => {
    const chatId = String(ctx.chat.id);
    const userId = String(ctx.from!.id);
    const scopeId = buildTelegramScopeId(chatId, userId);
    const caption = ctx.message.caption?.trim() || "";

    if (!accessControl.isAllowed(userId)) return;

    setActiveRouteAnchor("telegram", { chatId, userId });
    setChatUser(chatId, userId, "telegram");

    try {
      const video = ctx.message.video;
      const contextText = buildMediaContext({
        Filename: video.file_name,
        DurationSeconds: video.duration,
        Width: video.width,
        Height: video.height,
        MimeType: video.mime_type,
      }, caption ? `Caption: ${caption}` : undefined);
      const path = await downloadTelegramFile(
        bot,
        video.file_id,
        video.file_name ?? video.file_unique_id ?? video.file_id,
        "mp4",
      );
      const enqueueResult = await enqueueSavedMedia(scopeId, chatId, "video", path, contextText);
      if (enqueueResult === "rejected") {
        await sendTextReply(chatId, "请求队列已满，请稍后再试。");
      } else if (enqueueResult === "queued") {
        await sendTextReply(chatId, "您的请求已排队等待。");
      }
    } catch (err) {
      log.error("Failed to download video:", err);
      await sendTextReply(chatId, "视频下载失败。");
    }
  });

  return {
    stop: () => stopTaskCleanup(),
    getRunningTaskCount: () => runningTasks.size,
  };
}
