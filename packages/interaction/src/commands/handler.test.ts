import { describe, expect, it, vi } from "vitest";
import { CommandHandler } from "./handler.js";

function createHandler(options: {
  platform?: "dingtalk" | "feishu" | "qq" | "telegram" | "wechat" | "wework";
  sessionManager?: Record<string, unknown>;
  requestQueue?: Record<string, unknown>;
  sendTextReply?: ReturnType<typeof vi.fn>;
  sendDirectorySelection?: ReturnType<typeof vi.fn>;
  runningTasks?: number;
}) {
  const sendTextReply = options.sendTextReply ?? vi.fn(async () => {});
  const sendDirectorySelection = options.sendDirectorySelection;
  const handler = new CommandHandler({
    config: {
      aiCommand: "claude",
      platforms: {
        telegram: { enabled: true, allowedUserIds: [] },
        feishu: { enabled: true, allowedUserIds: [] },
        qq: { enabled: true, allowedUserIds: [] },
        wechat: { enabled: true, allowedUserIds: [] },
        wework: { enabled: true, allowedUserIds: [] },
        dingtalk: { enabled: true, allowedUserIds: [] },
      },
      codexCliPath: "codex",
      codebuddyCliPath: "codebuddy",
    } as never,
    sessionManager: {
      getWorkDir: () => "/tmp/work",
      getConversationStatus: () => ({
        convId: undefined,
        sessionId: undefined,
        workDir: "/tmp/work",
        historyTurns: 0,
        continuityMode: "fresh",
      }),
      newSession: () => false,
      setWorkDir: async () => "/tmp/work",
      ...options.sessionManager,
    } as never,
    requestQueue: {
      inspect: () => ({ running: false, pending: 0 }),
      clearPending: () => ({ running: false, dropped: 0 }),
      ...options.requestQueue,
    } as never,
    sender: {
      sendTextReply,
      ...(sendDirectorySelection ? { sendDirectorySelection } : {}),
    },
    getRunningTasksSize: () => options.runningTasks ?? 0,
  });

  return { handler, sendTextReply, sendDirectorySelection };
}

describe("CommandHandler", () => {
  it("/status does not create a conversation as a side effect", async () => {
    const getConversationStatus = vi.fn(() => ({
      convId: undefined,
      sessionId: undefined,
      workDir: "/tmp/work",
      historyTurns: 0,
      continuityMode: "fresh",
    }));
    const inspect = vi.fn(() => ({ running: false, pending: 0 }));
    const { handler, sendTextReply } = createHandler({
      sessionManager: {
        getConversationStatus,
      },
      requestQueue: { inspect },
      runningTasks: 1,
    });

    const handled = await handler.dispatch(
      "/status",
      "chat-1",
      "user-1",
      "telegram",
      vi.fn(async () => {}),
    );

    expect(handled).toBe(true);
    expect(getConversationStatus).toHaveBeenCalledWith("user-1", "claude");
    expect(inspect).toHaveBeenCalledWith("user-1", undefined);
    expect(sendTextReply).toHaveBeenCalledWith(
      "chat-1",
      expect.stringContaining("会话: 无"),
    );
    expect(sendTextReply).toHaveBeenCalledWith(
      "chat-1",
      expect.stringContaining("上下文模式: 全新上下文"),
    );
    expect(sendTextReply).toHaveBeenCalledWith(
      "chat-1",
      expect.stringContaining("版本/模式: SDK 模式"),
    );
  });

  it("/new clears queued requests and warns that running tasks may still finish", async () => {
    const clearPending = vi.fn(() => ({ running: true, dropped: 2 }));
    const { handler, sendTextReply } = createHandler({
      platform: "telegram",
      sessionManager: {
        getConversationStatus: () => ({
          convId: "conv-old",
          sessionId: undefined,
          workDir: "/tmp/work",
          historyTurns: 0,
          continuityMode: "fresh",
        }),
        newSession: () => true,
      },
      requestQueue: { clearPending },
    });

    await handler.dispatch(
      "/new",
      "chat-1",
      "user-1",
      "telegram",
      vi.fn(async () => {}),
    );

    expect(clearPending).toHaveBeenCalledWith("user-1", "conv-old");
    expect(sendTextReply).toHaveBeenCalledWith(
      "chat-1",
      expect.stringContaining("已清除 2 条排队请求"),
    );
    expect(sendTextReply).toHaveBeenCalledWith(
      "chat-1",
      expect.stringContaining("不会被强制中断"),
    );
  });

  it("/cd clears queued requests from the previous conversation", async () => {
    const clearPending = vi.fn(() => ({ running: false, dropped: 1 }));
    const { handler, sendTextReply } = createHandler({
      sessionManager: {
        getConversationStatus: () => ({
          convId: "conv-old",
          sessionId: undefined,
          workDir: "/tmp/work",
          historyTurns: 0,
          continuityMode: "fresh",
        }),
        setWorkDir: vi.fn(async () => "/tmp/next"),
      },
      requestQueue: { clearPending },
    });

    await handler.dispatch(
      "/cd /tmp/next",
      "chat-1",
      "user-1",
      "wework",
      vi.fn(async () => {}),
    );

    expect(clearPending).toHaveBeenCalledWith("user-1", "conv-old");
    expect(sendTextReply).toHaveBeenCalledWith(
      "chat-1",
      expect.stringContaining("后续新消息将使用新目录和全新上下文"),
    );
    expect(sendTextReply).toHaveBeenCalledWith(
      "chat-1",
      expect.stringContaining("已清除 1 条排队请求"),
    );
  });

  it("/help uses the correct platform-specific cleanup hint and lists picker support", async () => {
    const { handler, sendTextReply } = createHandler({});

    await handler.dispatch(
      "/help",
      "chat-1",
      "user-1",
      "qq",
      vi.fn(async () => {}),
    );

    expect(sendTextReply).toHaveBeenCalledWith(
      "chat-1",
      expect.stringContaining("请在 QQ 中清空聊天记录"),
    );
    expect(sendTextReply).toHaveBeenCalledWith(
      "chat-1",
      expect.stringContaining("直接发送 /cd 可打开目录选择器"),
    );
  });

  it("/help for Telegram includes /start", async () => {
    const { handler, sendTextReply } = createHandler({});

    await handler.dispatch(
      "/help",
      "chat-1",
      "user-1",
      "telegram",
      vi.fn(async () => {}),
    );

    expect(sendTextReply).toHaveBeenCalledWith(
      "chat-1",
      expect.stringContaining("/start - 显示欢迎信息"),
    );
  });
});
