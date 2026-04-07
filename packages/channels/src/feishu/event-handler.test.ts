import { beforeEach, describe, expect, it, vi } from "vitest";

const runAITaskMock = vi.fn(async (_deps, _ctx, _prompt, _adapter, callbacks) => {
  await callbacks.sendFile("/tmp/report.pdf");
});
const sendFileReplyMock = vi.fn(async () => {});
const sendThinkingCardMock = vi.fn(async () => ({ messageId: "msg-1", cardId: "card-1" }));
const sendTextReplyMock = vi.fn(async () => {});
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
    setActiveChatId: vi.fn(),
    setActiveRouteAnchor: vi.fn(),
  };
});

vi.mock("../../../interaction/src/index.js", async () => {
  const actual = await vi.importActual<typeof import("../../../interaction/src/index.js")>("../../../interaction/src/index.js");
  return {
    ...actual,
    CommandHandler: class CommandHandler {
      async dispatch(...args: unknown[]) {
        return commandDispatchMock(...args);
      }
    },
    runAITask: runAITaskMock,
    setChatUser: vi.fn(),
  };
});

vi.mock("../../../agents/src/index.js", () => ({
  getAdapter: vi.fn(() => ({ run: vi.fn() })),
}));

vi.mock("./message-sender.js", () => ({
  sendThinkingMessage: vi.fn(async () => "stream-1"),
  updateMessage: vi.fn(async () => {}),
  sendFinalMessages: vi.fn(async () => {}),
  sendTextReply: sendTextReplyMock,
  sendTextReplyByOpenId: vi.fn(async () => {}),
  startTypingLoop: vi.fn(() => vi.fn()),
  sendImageReply: vi.fn(async () => {}),
  sendFileReply: sendFileReplyMock,
  sendThinkingCard: sendThinkingCardMock,
  streamContentUpdate: vi.fn(async () => {}),
  sendFinalCards: vi.fn(async () => {}),
  sendErrorCard: vi.fn(async () => {}),
}));

vi.mock("./card-builder.js", () => ({
  buildCardV2: vi.fn(() => ({})),
}));

vi.mock("./cardkit-manager.js", () => ({
  disableStreaming: vi.fn(async () => {}),
  updateCardFull: vi.fn(async () => {}),
  destroySession: vi.fn(),
}));

vi.mock("@larksuiteoapi/node-sdk", () => ({
  Client: class MockClient {},
}));

describe("Feishu event handler", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    commandDispatchMock.mockReset();
    commandDispatchMock.mockResolvedValue(false);
  });

  it("routes generated files from AI tasks into the native Feishu file sender", async () => {
    const handler = (await import("./event-handler.js")).setupFeishuHandlers(
      {
        feishuAllowedUserIds: [],
      } as never,
      {
        getWorkDir: vi.fn(() => "/tmp/work"),
        getConvId: vi.fn(() => "conv-1"),
        getSessionIdForConv: vi.fn(() => undefined),
      } as never,
    );

    await handler.handleEvent({
      event: {
        event_type: "im.message.receive_v1",
        message: {
          chat_id: "chat-1",
          message_id: "msg-in-1",
          message_type: "text",
          content: JSON.stringify({ text: "生成文件" }),
          chat_type: "p2p",
        },
        sender: {
          sender_id: {
            open_id: "user-1",
          },
        },
      },
    });

    expect(sendThinkingCardMock).toHaveBeenCalledWith("chat-1", "codex");
    expect(sendFileReplyMock).toHaveBeenCalledWith("chat-1", "/tmp/report.pdf");
  });

  it("returns a command error instead of enqueueing failed command text as AI input", async () => {
    commandDispatchMock.mockRejectedValueOnce(new Error("dispatch failed"));
    const handler = (await import("./event-handler.js")).setupFeishuHandlers(
      {
        feishuAllowedUserIds: [],
      } as never,
      {
        getWorkDir: vi.fn(() => "/tmp/work"),
        getConvId: vi.fn(() => "conv-1"),
        getSessionIdForConv: vi.fn(() => undefined),
      } as never,
    );

    await handler.handleEvent({
      event: {
        event_type: "im.message.receive_v1",
        message: {
          chat_id: "chat-1",
          message_id: "msg-cmd",
          message_type: "text",
          content: JSON.stringify({ text: "/cd /tmp" }),
          chat_type: "p2p",
        },
        sender: {
          sender_id: {
            open_id: "user-1",
          },
        },
      },
    });

    expect(sendTextReplyMock).toHaveBeenCalledWith("chat-1", "命令执行失败，请重试。");
    expect(runAITaskMock).not.toHaveBeenCalled();
  });
});
