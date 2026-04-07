/**
 * 共享 AI 任务执行层，支持多 ToolAdapter。
 */

import {
  createLogger,
  resolvePlatformAiCommand,
  type Config,
  type Platform,
  type SessionManager,
} from "../../../state/src/index.js";
import type { ParsedResult, ToolAdapter } from "../../../agents/src/index.js";
import {
  buildContinuityPrompt,
  continuityModeLabel,
  resolveContinuityMode,
} from './conversation-continuity.js';
import {
  buildCurrentTaskMediaPrompt,
  shouldInjectCurrentTaskMediaPrompt,
  supportsCurrentTaskMediaTool,
} from "./current-task-media.js";
import {
  formatToolStats,
  formatToolCallNotification,
  getContextWarning,
  getAIToolDisplayName,
} from './utils.js';
import type { CurrentTaskMediaHookRegistration, CurrentTaskMediaHook } from "./current-task-media.js";

const log = createLogger('AITask');

export interface TaskDeps {
  config: Config;
  sessionManager: SessionManager;
  currentTaskMediaHook?: CurrentTaskMediaHook;
}

export interface TaskContext {
  userId: string;
  chatId: string;
  workDir: string;
  sessionId: string | undefined;
  convId?: string;
  threadId?: string;
  platform: string;
  taskKey: string;
}

export interface TaskAdapter {
  streamUpdate(content: string, toolNote?: string): void;
  sendComplete(content: string, note: string, thinkingText?: string): Promise<void>;
  sendError(error: string): Promise<void>;
  onThinkingToText?(content: string): void;
  extraCleanup?(): void;
  throttleMs: number;
  /** 块级流式：仅当内容增长超过此字符数时才更新，减少 patch 次数。 */
  minContentDeltaChars?: number;
  onTaskReady(state: TaskRunState): void;
  onFirstContent?(): void;
  sendImage?(imagePath: string): Promise<void>;
  sendFile?(filePath: string): Promise<void>;
}

export interface TaskRunState {
  handle: { abort: () => void };
  latestContent: string;
  settle: () => void;
  startedAt: number;
  /** AI 工具标识，用于动态显示工具名称。 */
  toolId: string;
}

function isUsageLimitError(error: string): boolean {
  return /usage limit/i.test(error) || /try again at\s+\d{1,2}:\d{2}\s*(AM|PM)/i.test(error);
}

function isCodexTimeoutError(error: string): boolean {
  return (
    error.includes("Codex 执行空闲超时") ||
    error.includes("Codex 执行总超时") ||
    /timed out after \d+ms/i.test(error)
  );
}

function shouldPreserveSessionOnError(input: {
  aiCommand: string;
  error: string;
  hadObservableProgress: boolean;
}): boolean {
  if (input.aiCommand !== "codex") {
    return false;
  }
  if (isUsageLimitError(input.error)) {
    return true;
  }
  return isCodexTimeoutError(input.error) && input.hadObservableProgress;
}

function buildFriendlyTaskError(input: {
  error: string;
  hadSessionInvalid: boolean;
  toolId: string;
  preservedSession: boolean;
}): string {
  if (input.hadSessionInvalid) {
    return `当前 ${getAIToolDisplayName(input.toolId)} 原生会话已失效，已清理旧会话，请重新发送刚才的问题。`;
  }
  if (input.preservedSession && isCodexTimeoutError(input.error)) {
    return `${input.error}\n\n已保留当前 Codex 会话。可直接回复“继续”或补充要求，接着当前任务继续执行。`;
  }
  return input.error;
}

function buildCompletionNote(
  result: ParsedResult,
  sessionManager: SessionManager,
  ctx: TaskContext
): string {
  const toolInfo = formatToolStats(result.toolStats, result.numTurns);
  const parts: string[] = [];
  parts.push(`耗时 ${(result.durationMs / 1000).toFixed(1)}s`);
  if (toolInfo) parts.push(toolInfo);
  if (result.model) parts.push(result.model);

  const currentTurns = ctx.threadId
    ? sessionManager.addTurnsForThread(ctx.userId, ctx.threadId, 0)
    : sessionManager.addTurns(ctx.userId, 0);
  const ctxWarning = getContextWarning(currentTurns);
  if (ctxWarning) parts.push(ctxWarning);

  return parts.join(' | ');
}

function buildStatusPrefix(mode: "fresh" | "relay" | "native"): string | undefined {
  return mode === "native"
    ? undefined
    : `ℹ️ 上下文模式：${continuityModeLabel(mode)}`;
}

function reportGeneratedMediaFailure(
  kind: "image" | "file",
  path: string,
  ctx: Pick<TaskContext, "userId" | "chatId" | "platform" | "taskKey">,
  error: unknown,
) {
  log.error(
    `Generated ${kind} delivery failed: user=${ctx.userId}, chat=${ctx.chatId}, platform=${ctx.platform}, taskKey=${ctx.taskKey}, path=${path}`,
    error,
  );
}

function resolveRunTimeouts(config: Config, aiCommand: string) {
  if (aiCommand === 'codex') {
    return {
      timeoutMs: config.codexTimeoutMs,
      idleTimeoutMs: config.codexIdleTimeoutMs,
    };
  }

  if (aiCommand === 'codebuddy') {
    return {
      timeoutMs: config.codebuddyTimeoutMs,
      idleTimeoutMs: config.codebuddyIdleTimeoutMs,
    };
  }

  return {
    timeoutMs: config.claudeTimeoutMs,
  };
}

export function runAITask(
  deps: TaskDeps,
  ctx: TaskContext,
  prompt: string,
  toolAdapter: ToolAdapter,
  platformAdapter: TaskAdapter
): Promise<void> {
  const { config, sessionManager } = deps;
  return new Promise((resolve) => {
    let lastUpdateTime = 0;
    let lastSentContentLength = 0;
    let pendingUpdate: ReturnType<typeof setTimeout> | null = null;
    let settled = false;
    let firstContentLogged = false;
    let wasThinking = false;
    let thinkingText = '';
    let currentSessionId = ctx.sessionId;
    let hadSessionInvalid = false;
    let hadObservableProgress = false;
    let activeHandle: { abort: () => void } | null = null;
    let mediaHookRegistration: CurrentTaskMediaHookRegistration | null = null;
    const toolLines: string[] = [];
    const minDelta = platformAdapter.minContentDeltaChars ?? 0;

    const cleanup = () => {
      if (pendingUpdate) {
        clearTimeout(pendingUpdate);
        pendingUpdate = null;
      }
      mediaHookRegistration?.revoke();
      mediaHookRegistration = null;
      platformAdapter.extraCleanup?.();
    };

    const settle = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    // Declared before assignment so closures can capture it; object is assigned below
    // eslint-disable-next-line prefer-const -- assigned once after closures are defined
    let taskState: TaskRunState;

    const throttledUpdate = (content: string, force = false) => {
      taskState.latestContent = content;
      const now = Date.now();
      const elapsed = now - lastUpdateTime;
      const contentDelta = content.length - lastSentContentLength;
      const shouldUpdateByTime = elapsed >= platformAdapter.throttleMs;
      const shouldUpdateByContent = minDelta > 0 && contentDelta >= minDelta;

      if (force || shouldUpdateByTime || shouldUpdateByContent) {
        lastUpdateTime = now;
        lastSentContentLength = content.length;
        if (pendingUpdate) {
          clearTimeout(pendingUpdate);
          pendingUpdate = null;
        }
        const toolNote = toolLines.length > 0 ? toolLines.slice(-3).join('\n') : undefined;
        platformAdapter.streamUpdate(content, toolNote);
      } else if (!pendingUpdate) {
        pendingUpdate = setTimeout(() => {
          pendingUpdate = null;
          lastUpdateTime = Date.now();
          lastSentContentLength = taskState.latestContent.length;
          const toolNote = toolLines.length > 0 ? toolLines.slice(-3).join('\n') : undefined;
          platformAdapter.streamUpdate(taskState.latestContent, toolNote);
        }, platformAdapter.throttleMs - elapsed);
      }
    };

    // 使用 aiCommand 而不是 toolAdapter.toolId，确保 sessionId 的存储和查询使用相同的 key
    const aiCommand = resolvePlatformAiCommand(config, ctx.platform as Platform);
    const toolId = aiCommand;
    const runTimeouts = resolveRunTimeouts(config, aiCommand);
    const historyTurns = sessionManager.getRecentTurns(ctx.userId);
    const continuityMode = resolveContinuityMode(currentSessionId, historyTurns);
    const basePrompt = continuityMode === "relay"
      ? buildContinuityPrompt({
          prompt,
          turns: historyTurns,
          toolId,
        })
      : prompt;
    mediaHookRegistration = supportsCurrentTaskMediaTool(ctx.platform as Platform)
      ? deps.currentTaskMediaHook?.registerCurrentTaskMediaTarget({
          taskKey: ctx.taskKey,
          platform: ctx.platform as Platform,
          chatId: ctx.chatId,
        }) ?? null
      : null;
    const runPrompt = mediaHookRegistration
      && shouldInjectCurrentTaskMediaPrompt(ctx.platform as Platform, aiCommand)
      ? buildCurrentTaskMediaPrompt({
          prompt: basePrompt,
          endpoint: mediaHookRegistration.endpoint,
          token: mediaHookRegistration.token,
        })
      : basePrompt;

    const startRun = () => {
      sessionManager.recordUserPrompt(ctx.userId, prompt);
      log.info(
        `[AITask] Starting: userId=${ctx.userId}, initialSessionId=${currentSessionId ?? 'new'}, continuity=${continuityMode}, prompt="${prompt.slice(0, 50)}..."`
      );

      activeHandle = toolAdapter.run(
        runPrompt,
        currentSessionId,
        ctx.workDir,
        {
        onSessionId: (id) => {
          log.info(`[AITask] SessionId callback: old=${currentSessionId ?? 'none'}, new=${id}, aiCommand=${aiCommand}, userId=${ctx.userId}`);
          currentSessionId = id;
          const convId = ctx.convId ?? sessionManager.getConvId(ctx.userId);
          sessionManager.setSessionIdForConv(ctx.userId, convId, aiCommand, id);
        },
        onSessionInvalid: () => {
          hadSessionInvalid = true;
          const convId = ctx.convId ?? sessionManager.peekConvId(ctx.userId);
          let ok = false;
          if (convId) {
            sessionManager.clearSessionForConv(ctx.userId, convId, aiCommand, "session_invalid");
            ok = true;
          } else {
            ok = sessionManager.clearActiveToolSession(ctx.userId, aiCommand, "session_invalid");
          }
          log.info(
            `[AITask] Session invalid for user ${ctx.userId}, aiCommand=${aiCommand}; native session cleared, ok=${ok}`
          );
        },
        onThinking: (t) => {
          hadObservableProgress = true;
          if (!firstContentLogged) {
            firstContentLogged = true;
            platformAdapter.onFirstContent?.();
          }
          wasThinking = true;
          thinkingText = t;
          const prefix = buildStatusPrefix(continuityMode);
          const content = prefix
            ? `${prefix}\n\n💭 **${getAIToolDisplayName(toolId)} 思考中...**\n\n${t}`
            : `💭 **${getAIToolDisplayName(toolId)} 思考中...**\n\n${t}`;
          throttledUpdate(content);
        },
        onText: (accumulated) => {
          hadObservableProgress = true;
          if (!firstContentLogged) {
            firstContentLogged = true;
            platformAdapter.onFirstContent?.();
          }
          if (wasThinking && platformAdapter.onThinkingToText) {
            wasThinking = false;
            if (pendingUpdate) {
              clearTimeout(pendingUpdate);
              pendingUpdate = null;
            }
            lastUpdateTime = Date.now();
            taskState.latestContent = accumulated;
            platformAdapter.onThinkingToText(accumulated);
            return;
          }
          wasThinking = false;
          const prefix = buildStatusPrefix(continuityMode);
          throttledUpdate(prefix ? `${prefix}\n\n${accumulated}` : accumulated);
        },
        onToolUse: (toolName, toolInput) => {
          hadObservableProgress = true;
          const notification = formatToolCallNotification(toolName, toolInput);
          toolLines.push(notification);
          if (toolLines.length > 5) toolLines.shift();
          throttledUpdate(taskState.latestContent, true);
        },
        onGeneratedImage: (imagePath) => {
          const mediaTask = platformAdapter.sendImage?.(imagePath);
          void mediaTask?.catch((error) => {
            reportGeneratedMediaFailure("image", imagePath, ctx, error);
          });
        },
        onGeneratedFile: (filePath) => {
          const mediaTask = platformAdapter.sendFile?.(filePath);
          void mediaTask?.catch((error) => {
            reportGeneratedMediaFailure("file", filePath, ctx, error);
          });
        },
        onComplete: async (result) => {
          if (settled) return;
          settled = true;
          if (pendingUpdate) {
            clearTimeout(pendingUpdate);
            pendingUpdate = null;
          }
          const note = buildCompletionNote(result, sessionManager, ctx);
          const output =
            result.accumulated ||
            result.result ||
            taskState.latestContent ||
            '(无输出)';
          sessionManager.recordAssistantReply(ctx.userId, output);
          if (!result.accumulated && !result.result && taskState.latestContent) {
            log.warn(
              `Empty AI output from adapter but had streamed content (${taskState.latestContent.length} chars), using latestContent. platform=${ctx.platform}, taskKey=${ctx.taskKey}`
            );
          } else if (!output || output === '(无输出)') {
            log.warn(
              `Empty AI output for user ${ctx.userId}, platform=${ctx.platform}, taskKey=${ctx.taskKey}`
            );
          }
          const sendCompleteWithRetry = async (attempt = 1): Promise<void> => {
            const maxAttempts = 2;
            try {
              await platformAdapter.sendComplete(output, note, thinkingText || undefined);
            } catch (err) {
              log.error(`Failed to send complete (attempt ${attempt}/${maxAttempts}):`, err);
              if (attempt < maxAttempts) {
                await new Promise((r) => setTimeout(r, 2000));
                return sendCompleteWithRetry(attempt + 1);
              }
              try {
                await platformAdapter.sendError(
                  '回复发送失败（网络异常），请重试。若多次出现可检查本机网络或稍后再试。'
                );
              } catch (sendErr) {
                log.error('Failed to send error fallback:', sendErr);
              }
            }
          };
          try {
            await sendCompleteWithRetry();
          } finally {
            cleanup();
            resolve();
          }
        },
        onError: async (error) => {
          if (settled) return;
          if (pendingUpdate) {
            clearTimeout(pendingUpdate);
            pendingUpdate = null;
          }
          settled = true;
          log.error(`Task error for user ${ctx.userId}: ${error}`);
          const preserveSession = shouldPreserveSessionOnError({
            aiCommand,
            error,
            hadObservableProgress,
          });
          if (aiCommand !== 'claude' && !preserveSession) {
            if (ctx.convId) sessionManager.clearSessionForConv(ctx.userId, ctx.convId, aiCommand, "task_error");
            else sessionManager.clearActiveToolSession(ctx.userId, aiCommand, "task_error");
            log.info(`Session reset for user ${ctx.userId} due to ${aiCommand} task error`);
          } else if (aiCommand === 'codex') {
            log.info(
              `Keeping codex session for user ${ctx.userId} after recoverable error: ${error}`,
            );
          }
          const friendlyError = buildFriendlyTaskError({
            error,
            hadSessionInvalid,
            toolId,
            preservedSession: preserveSession,
          });
          try {
            await platformAdapter.sendError(friendlyError);
          } catch (err) {
            log.error('Failed to send error:', err);
          }
          cleanup();
          resolve();
        },
        },
        {
          ...runTimeouts,
          model: sessionManager.getModel(ctx.userId, ctx.threadId) ?? config.claudeModel,
          chatId: ctx.chatId,
          hookPort: mediaHookRegistration?.port,
          hookToken: mediaHookRegistration?.token,
          // 默认跳过权限确认，保持全自动执行
          skipPermissions: true,
          ...(aiCommand === 'codex' && config.codexProxy ? { proxy: config.codexProxy } : {}),
        }
      );
      return activeHandle;
    };

    taskState = {
      handle: {
        abort: () => {
          activeHandle?.abort();
          cleanup();
          settle();
        },
      },
      latestContent: '',
      settle,
      startedAt: Date.now(),
      toolId: aiCommand,
    };
    startRun();
    platformAdapter.onTaskReady(taskState);
  });
}
