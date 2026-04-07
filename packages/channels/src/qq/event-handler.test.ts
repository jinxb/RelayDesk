import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QQMessageEvent } from "./types.js";

const sendThinkingMessageMock = vi.fn(async () => "stream-1");
const sendFinalMessagesMock = vi.fn(async () => {});
const sendTextReplyMock = vi.fn(async () => {});
const sendImageReplyMock = vi.fn(async () => {});
const sendFileReplyMock = vi.fn(async () => {});
const sendErrorMessageMock = vi.fn(async () => {});
const runAITaskMock = vi.fn(async (_deps, _ctx, _prompt, _adapter, callbacks) => {
  await callbacks.sendComplete("ok", "耗时 0.1s");
});
const getAdapterMock = vi.fn(() => ({ name: "mock-adapter" }));
const setChatUserMock = vi.fn();
const commandDispatchMock = vi.fn(async () => false);

vi.mock("./message-sender.js", () => ({
  sendThinkingMessage: sendThinkingMessageMock,
  updateMessage: vi.fn(async () => {}),
  sendFinalMessages: sendFinalMessagesMock,
  sendErrorMessage: sendErrorMessageMock,
  sendTextReply: sendTextReplyMock,
  sendImageReply: sendImageReplyMock,
  sendFileReply: sendFileReplyMock,
  sendDirectorySelection: vi.fn(async () => {}),
  startTypingLoop: vi.fn(() => vi.fn()),
}));

vi.mock("../../../interaction/src/index.js", async () => {
  const actual = await vi.importActual("../../../interaction/src/index.js");
  return {
    ...actual,
    CommandHandler: class CommandHandler {
      async dispatch(...args: unknown[]) {
        return commandDispatchMock(...args);
      }
    },
    runAITask: runAITaskMock,
    setChatUser: setChatUserMock,
  };
});

vi.mock("../../../agents/src/index.js", async () => {
  const actual = await vi.importActual("../../../agents/src/index.js");
  return {
    ...actual,
    getAdapter: getAdapterMock,
  };
});

function createPrivateMessage(id: string): QQMessageEvent {
  return {
    type: "private",
    id,
    content: "你好",
    userOpenid: "user-1",
  };
}

describe("QQ event handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commandDispatchMock.mockReset();
    commandDispatchMock.mockResolvedValue(false);
  });

  function createConfig() {
    return {
      aiCommand: "codex",
      qqAllowedUserIds: ["user-1"],
      defaultPermissionMode: "ask",
      platforms: {
        qq: {
          enabled: true,
          aiCommand: "codex",
          allowedUserIds: ["user-1"],
        },
      },
    } as never;
  }

  function createSessionManager() {
    return {
      getWorkDir: vi.fn(() => "D:\\coding\\relaydesk"),
      getConvId: vi.fn(() => "conv-1"),
      getSessionIdForConv: vi.fn(() => "session-1"),
    } as never;
  }

  it("treats repeated identical messages with different event ids as distinct requests", async () => {
    const { setupQQHandlers } = await import("./event-handler.js");
    const handler = setupQQHandlers(createConfig(), createSessionManager());

    await handler.handleEvent(createPrivateMessage("evt-1"));
    await handler.handleEvent(createPrivateMessage("evt-2"));
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(sendThinkingMessageMock).toHaveBeenCalledTimes(2);
    expect(runAITaskMock).toHaveBeenCalledTimes(2);
    expect(sendFinalMessagesMock).toHaveBeenCalledTimes(2);
  });

  it("still dedupes id-less semantic duplicates as a fallback", async () => {
    const { setupQQHandlers } = await import("./event-handler.js");
    const handler = setupQQHandlers(createConfig(), createSessionManager());

    await handler.handleEvent({
      ...createPrivateMessage(""),
      id: "",
    });
    await handler.handleEvent({
      ...createPrivateMessage(""),
      id: "",
    });

    expect(sendThinkingMessageMock).toHaveBeenCalledTimes(1);
    expect(runAITaskMock).toHaveBeenCalledTimes(1);
  });

  it("routes generated images from the AI task into the QQ image reply path", async () => {
    runAITaskMock.mockImplementationOnce(async (_deps, _ctx, _prompt, _adapter, callbacks) => {
      await callbacks.sendImage("D:\\coding\\relaydesk\\generated.png");
      await callbacks.sendComplete("ok", "耗时 0.1s");
    });

    const { setupQQHandlers } = await import("./event-handler.js");
    const handler = setupQQHandlers(createConfig(), createSessionManager());

    await handler.handleEvent(createPrivateMessage("evt-image"));

    expect(sendImageReplyMock).toHaveBeenCalledWith(
      "private:user-1",
      "D:\\coding\\relaydesk\\generated.png",
    );
  });

  it("routes generated files from the AI task into the QQ file reply path", async () => {
    runAITaskMock.mockImplementationOnce(async (_deps, _ctx, _prompt, _adapter, callbacks) => {
      await callbacks.sendFile("D:\\coding\\relaydesk\\report.txt");
      await callbacks.sendComplete("ok", "耗时 0.1s");
    });

    const { setupQQHandlers } = await import("./event-handler.js");
    const handler = setupQQHandlers(createConfig(), createSessionManager());

    await handler.handleEvent(createPrivateMessage("evt-file"));

    expect(sendFileReplyMock).toHaveBeenCalledWith(
      "private:user-1",
      "D:\\coding\\relaydesk\\report.txt",
    );
  });

  it("returns a command error instead of continuing into AI execution when command dispatch fails", async () => {
    commandDispatchMock.mockRejectedValueOnce(new Error("dispatch failed"));
    const { setupQQHandlers } = await import("./event-handler.js");
    const handler = setupQQHandlers(createConfig(), createSessionManager());

    await handler.handleEvent({
      ...createPrivateMessage("evt-cmd"),
      content: "/cd /tmp",
    });

    expect(sendTextReplyMock).toHaveBeenCalledWith("private:user-1", "命令执行失败，请重试。");
    expect(runAITaskMock).not.toHaveBeenCalled();
  });
});
