import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WeWorkCallbackMessage } from "./types.js";

const sendThinkingMessageMock = vi.fn(async () => "stream-1");
const sendFinalMessagesMock = vi.fn(async () => {});
const sendTextReplyMock = vi.fn(async () => {});
const sendImageReplyMock = vi.fn(async () => {});
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
  startTypingLoop: vi.fn(() => vi.fn()),
  setCurrentReqId: vi.fn(),
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

function createTextMessage(msgid: string): WeWorkCallbackMessage {
  return {
    cmd: "aibot_msg_callback" as never,
    headers: { req_id: "req-1" },
    body: {
      msgid,
      aibotid: "bot-1",
      chatid: "chat-1",
      chattype: "single",
      from: { userid: "user-1" },
      response_url: "https://example.com/response",
      msgtype: "text",
      text: { content: "你好" },
    },
  };
}

describe("WeWork event handler lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commandDispatchMock.mockReset();
    commandDispatchMock.mockResolvedValue(false);
  });

  it("ignores duplicate callback msgids and only runs the task once", async () => {
    const { setupWeWorkHandlers } = await import("./event-handler.js");

    const handler = setupWeWorkHandlers(
      {
        aiCommand: "codex",
        weworkAllowedUserIds: ["user-1"],
        platforms: {
          wework: {
            enabled: true,
            aiCommand: "codex",
            allowedUserIds: ["user-1"],
          },
        },
      } as never,
      {
        getWorkDir: vi.fn(() => "/tmp/relaydesk"),
        getConvId: vi.fn(() => "conv-1"),
        getSessionIdForConv: vi.fn(() => "session-1"),
      } as never,
    );

    await handler.handleEvent(createTextMessage("msg-1"));
    await handler.handleEvent(createTextMessage("msg-1"));

    expect(runAITaskMock).toHaveBeenCalledTimes(1);
    expect(sendFinalMessagesMock).toHaveBeenCalledTimes(1);
  });

  it("returns an explicit command error instead of continuing into AI execution", async () => {
    commandDispatchMock.mockRejectedValueOnce(new Error("dispatch failed"));
    const { setupWeWorkHandlers } = await import("./event-handler.js");

    const handler = setupWeWorkHandlers(
      {
        aiCommand: "codex",
        weworkAllowedUserIds: ["user-1"],
        platforms: {
          wework: {
            enabled: true,
            aiCommand: "codex",
            allowedUserIds: ["user-1"],
          },
        },
      } as never,
      {
        getWorkDir: vi.fn(() => "/tmp/relaydesk"),
        getConvId: vi.fn(() => "conv-1"),
        getSessionIdForConv: vi.fn(() => "session-1"),
      } as never,
    );

    await handler.handleEvent({
      ...createTextMessage("msg-cmd"),
      body: {
        ...createTextMessage("msg-cmd").body,
        text: { content: "/cd /tmp" },
      },
    });

    expect(sendTextReplyMock).toHaveBeenCalledWith("chat-1", "命令执行失败，请重试。", "req-1");
    expect(runAITaskMock).not.toHaveBeenCalled();
  });
});
