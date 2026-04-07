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
} from "../../../interaction/src/index.js";
import { getAdapter } from "../../../agents/src/index.js";
import {
  WECHAT_VOICE_TRANSCRIPT_REQUIRED_MESSAGE,
  buildWeChatMediaPrompt,
} from "./media.js";
import {
  coerceWeChatIncomingMessage,
} from "./normalize.js";
import {
  sendDirectorySelection,
  sendErrorMessage,
  sendFileReply,
  sendFinalMessages,
  sendImageReply,
  sendTextReply,
  sendThinkingMessage,
  startTypingLoop,
  updateMessage,
} from "./message-sender.js";
import type { WeChatIncomingMessage } from "./types.js";
import type { ChannelRuntimeServices } from "../runtime-services.js";

export interface WeChatEventHandlerHandle {
  stop(): void;
  getRunningTaskCount(): number;
  handleEvent(data: unknown): Promise<void>;
}

const log = createLogger("WeChatHandler");
const WECHAT_THROTTLE_MS = 1200;
const WECHAT_MIN_STREAM_DELTA_CHARS = 120;

function buildWeChatScopeId(chatId: string, userId: string): string {
  return buildScopedSessionOwnerId({
    platform: "wechat",
    chatId,
    userId,
  });
}

function resolveChatId(message: WeChatIncomingMessage): string {
  return message.from_user_id;
}

async function resolvePrompt(
  message: WeChatIncomingMessage,
  chatId: string,
): Promise<string | null> {
  if (message.msg_type === "text") {
    return message.content.trim() || null;
  }

  const mediaPrompt = await buildWeChatMediaPrompt(message);
  if (mediaPrompt) {
    return mediaPrompt;
  }

  if (message.msg_type === "voice") {
    await sendTextReply(chatId, WECHAT_VOICE_TRANSCRIPT_REQUIRED_MESSAGE);
  }
  return null;
}

export function setupWeChatHandlers(
  config: Config,
  sessionManager: SessionManager,
  services: ChannelRuntimeServices = {},
): WeChatEventHandlerHandle {
  const accessControl = new AccessControl(config.wechatAllowedUserIds);
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
  ): Promise<"running" | "queued" | "rejected"> {
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
  ) {
    const aiCommand = resolvePlatformAiCommand(config, "wechat");
    const toolAdapter = getAdapter(aiCommand);
    if (!toolAdapter) {
      await sendTextReply(chatId, `未配置 AI 工具：${aiCommand}`);
      return;
    }

    const sessionId = convId
      ? sessionManager.getSessionIdForConv(scopeId, convId, aiCommand)
      : undefined;
    const toolId = aiCommand;
    const messageId = await sendThinkingMessage(chatId, undefined, toolId);
    const stopTyping = startTypingLoop(chatId);
    const taskKey = `${scopeId}:${messageId}`;

    await runAITask(
      { config, sessionManager, currentTaskMediaHook: services.currentTaskMediaHook },
      { userId: scopeId, chatId, workDir, sessionId, convId, platform: "wechat", taskKey },
      prompt,
      toolAdapter,
      {
        throttleMs: WECHAT_THROTTLE_MS,
        minContentDeltaChars: WECHAT_MIN_STREAM_DELTA_CHARS,
        streamUpdate: async (content, toolNote) => {
          await updateMessage(chatId, messageId, content, "streaming", toolNote, toolId);
        },
        sendComplete: async (content, note) => {
          await sendFinalMessages(chatId, messageId, content, note ?? "", toolId);
        },
        sendError: async (error) => {
          await sendErrorMessage(chatId, error, toolId);
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

  return {
    stop() {
      stopTaskCleanup();
    },
    getRunningTaskCount() {
      return runningTasks.size;
    },
    async handleEvent(data: unknown): Promise<void> {
      const message = coerceWeChatIncomingMessage(data);
      if (!message) {
        return;
      }

      const userId = message.from_user_id.trim();
      const chatId = resolveChatId(message).trim();
      if (!userId || !chatId) {
        return;
      }

      if (!accessControl.isAllowed(userId)) {
        await sendTextReply(chatId, `抱歉，您没有访问权限。\n您的微信用户 ID：${userId}`);
        return;
      }

      setActiveRouteAnchor("wechat", { chatId, userId });
      setChatUser(chatId, userId, "wechat");
      const scopeId = buildWeChatScopeId(chatId, userId);

      const text = message.content.trim();
      if (message.msg_type === "text" && text) {
        let handled = false;
        try {
          handled = await commandHandler.dispatch(text, chatId, scopeId, "wechat", handleAIRequest);
        } catch (error) {
          log.error("Error in commandHandler.dispatch:", error);
          await sendTextReply(chatId, "命令执行失败，请重试。");
          return;
        }
        if (handled) {
          return;
        }
      }

      const prompt = await resolvePrompt(message, chatId);
      if (!prompt) {
        return;
      }

      const enqueueResult = await enqueuePrompt(scopeId, chatId, prompt);
      if (enqueueResult === "rejected") {
        await sendTextReply(chatId, "请求队列已满，请稍后再试。");
      } else if (enqueueResult === "queued") {
        await sendTextReply(chatId, "您的请求已排队等待。");
      }

      log.info(`WeChat message handled: user=${userId}, chat=${chatId}, type=${message.msg_type}, status=${enqueueResult}`);
    },
  };
}
