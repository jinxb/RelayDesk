import { beforeEach, describe, expect, it, vi } from "vitest";

const runAITaskMock = vi.fn(async () => {});
const setChatUserMock = vi.fn();
const setActiveChatIdMock = vi.fn();
const setActiveRouteAnchorMock = vi.fn();
const sendTextReplyMock = vi.fn(async () => {});
const sendThinkingMessageMock = vi.fn(async () => "msg-1");
const startTypingLoopMock = vi.fn(() => vi.fn());
const sendFinalMessagesMock = vi.fn(async () => {});
const sendErrorMessageMock = vi.fn(async () => {});
const sendImageReplyMock = vi.fn(async () => {});
const sendFileReplyMock = vi.fn(async () => {});
const updateMessageMock = vi.fn(async () => {});
const buildWeChatMediaPromptMock = vi.fn(async () => null);
const getAdapterMock = vi.fn(() => ({ run: vi.fn() }));
const cleanupStopMock = vi.fn();
const commandDispatchMock = vi.fn(async () => false);

vi.mock("../../../state/src/index.js", async () => {
  const actual = await vi.importActual<typeof import("../../../state/src/index.js")>("../../../state/src/index.js");
  return {
    ...actual,
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
    resolvePlatformAiCommand: vi.fn(() => "codex"),
    setActiveChatId: setActiveChatIdMock,
    setActiveRouteAnchor: setActiveRouteAnchorMock,
  };
});

vi.mock("../../../interaction/src/index.js", () => ({
  AccessControl: class AccessControl {
    isAllowed() {
      return true;
    }
  },
  CommandHandler: class CommandHandler {
    async dispatch(...args: unknown[]) {
      return commandDispatchMock(...args);
    }
  },
  RequestQueue: class RequestQueue {
    async enqueue(
      _userId: string,
      _convId: string,
      prompt: string,
      task: (nextPrompt: string) => Promise<void>,
    ) {
      await task(prompt);
      return "running";
    }
  },
  runAITask: runAITaskMock,
  setChatUser: setChatUserMock,
  startTaskCleanup: vi.fn(() => cleanupStopMock),
}));

vi.mock("../../../agents/src/index.js", () => ({
  getAdapter: getAdapterMock,
}));

vi.mock("./media.js", () => ({
  WECHAT_VOICE_TRANSCRIPT_REQUIRED_MESSAGE:
    "微信未提供这条语音的转文字结果，请先开启微信语音转文字后重新发送。",
  buildWeChatMediaPrompt: buildWeChatMediaPromptMock,
}));

vi.mock("./message-sender.js", () => ({
  sendTextReply: sendTextReplyMock,
  sendThinkingMessage: sendThinkingMessageMock,
  startTypingLoop: startTypingLoopMock,
  sendFinalMessages: sendFinalMessagesMock,
  sendErrorMessage: sendErrorMessageMock,
  sendImageReply: sendImageReplyMock,
  sendFileReply: sendFileReplyMock,
  updateMessage: updateMessageMock,
  sendDirectorySelection: vi.fn(async () => {}),
}));

describe("WeChat event handler", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getAdapterMock.mockReturnValue({ run: vi.fn() });
    buildWeChatMediaPromptMock.mockResolvedValue(null);
    commandDispatchMock.mockReset();
    commandDispatchMock.mockResolvedValue(false);
  });

  it("ignores payloads that cannot be normalized into WeChat messages", async () => {
    const handler = (await import("./event-handler.js")).setupWeChatHandlers({} as never, {
      getWorkDir: vi.fn(() => "/tmp/work"),
      getConvId: vi.fn(() => "conv-1"),
      getSessionIdForConv: vi.fn(() => undefined),
    } as never);

    await expect(handler.handleEvent({ invalid: true })).resolves.toBeUndefined();
    expect(runAITaskMock).not.toHaveBeenCalled();
  });

  it("runs AI tasks for inbound WeChat text messages", async () => {
    const sessionManager = {
      getWorkDir: vi.fn(() => "/tmp/work"),
      getConvId: vi.fn(() => "conv-1"),
      getSessionIdForConv: vi.fn(() => undefined),
    };
    const handler = (await import("./event-handler.js")).setupWeChatHandlers(
      {
        wechatAllowedUserIds: ["wechat-user-1"],
      } as never,
      sessionManager as never,
    );

    await handler.handleEvent({
      msg_id: "msg-in-1",
      msg_type: "text",
      from_user_id: "wechat-user-1",
      from_user_name: "wechat-user-1",
      to_user_id: "bot-1",
      content: "你好",
      create_time: Date.now(),
    });

    expect(setActiveRouteAnchorMock).toHaveBeenCalledWith("wechat", {
      chatId: "wechat-user-1",
      userId: "wechat-user-1",
    });
    expect(setChatUserMock).toHaveBeenCalledWith("wechat-user-1", "wechat-user-1", "wechat");
    expect(sendThinkingMessageMock).toHaveBeenCalledWith("wechat-user-1", undefined, "codex");
    expect(runAITaskMock).toHaveBeenCalledTimes(1);
  });

  it("returns an explicit transcription error for WeChat voice messages without transcript", async () => {
    const handler = (await import("./event-handler.js")).setupWeChatHandlers(
      {
        wechatAllowedUserIds: ["wechat-user-1"],
      } as never,
      {
        getWorkDir: vi.fn(() => "/tmp/work"),
        getConvId: vi.fn(() => "conv-1"),
        getSessionIdForConv: vi.fn(() => undefined),
      } as never,
    );

    await handler.handleEvent({
      msg_id: "voice-1",
      msg_type: "voice",
      from_user_id: "wechat-user-1",
      from_user_name: "wechat-user-1",
      to_user_id: "bot-1",
      content: "",
      create_time: Date.now(),
    });

    expect(sendTextReplyMock).toHaveBeenCalledWith(
      "wechat-user-1",
      expect.stringContaining("语音转文字"),
    );
    expect(runAITaskMock).not.toHaveBeenCalled();
  });

  it("routes generated files from AI tasks into the WeChat file reply path", async () => {
    runAITaskMock.mockImplementationOnce(async (_deps, _ctx, _prompt, _adapter, callbacks) => {
      await callbacks.sendFile("/tmp/reply.mp4");
      await callbacks.sendComplete("ok", "耗时 0.1s");
    });

    const sessionManager = {
      getWorkDir: vi.fn(() => "/tmp/work"),
      getConvId: vi.fn(() => "conv-1"),
      getSessionIdForConv: vi.fn(() => undefined),
    };
    const handler = (await import("./event-handler.js")).setupWeChatHandlers(
      {
        wechatAllowedUserIds: ["wechat-user-1"],
      } as never,
      sessionManager as never,
    );

    await handler.handleEvent({
      msg_id: "msg-in-file",
      msg_type: "text",
      from_user_id: "wechat-user-1",
      from_user_name: "wechat-user-1",
      to_user_id: "bot-1",
      content: "生成视频",
      create_time: Date.now(),
    });

    expect(sendFileReplyMock).toHaveBeenCalledWith("wechat-user-1", "/tmp/reply.mp4");
  });

  it("returns an explicit command failure instead of crashing or continuing", async () => {
    commandDispatchMock.mockRejectedValueOnce(new Error("dispatch failed"));
    const sessionManager = {
      getWorkDir: vi.fn(() => "/tmp/work"),
      getConvId: vi.fn(() => "conv-1"),
      getSessionIdForConv: vi.fn(() => undefined),
    };
    const handler = (await import("./event-handler.js")).setupWeChatHandlers(
      {
        wechatAllowedUserIds: ["wechat-user-1"],
      } as never,
      sessionManager as never,
    );

    await handler.handleEvent({
      msg_id: "msg-cmd-1",
      msg_type: "text",
      from_user_id: "wechat-user-1",
      from_user_name: "wechat-user-1",
      to_user_id: "bot-1",
      content: "/cd /tmp",
      create_time: Date.now(),
    });

    expect(sendTextReplyMock).toHaveBeenCalledWith("wechat-user-1", "命令执行失败，请重试。");
    expect(runAITaskMock).not.toHaveBeenCalled();
  });
});
