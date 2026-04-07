import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DWClientDownStream } from "dingtalk-stream";

const sendThinkingMessageMock = vi.fn(async () => "stream-1");
const sendFinalMessagesMock = vi.fn(async () => {});
const sendTextReplyMock = vi.fn(async () => {});
const sendImageReplyMock = vi.fn(async () => {});
const sendFileReplyMock = vi.fn(async () => {});
const sendErrorMessageMock = vi.fn(async () => {});
const ackMessageMock = vi.fn();
const registerSessionWebhookMock = vi.fn();
const runAITaskMock = vi.fn(async (_deps, _ctx, _prompt, _adapter, callbacks) => {
  await callbacks.sendComplete("ok", "耗时 0.1s");
});
const getAdapterMock = vi.fn(() => ({ name: "mock-adapter" }));
const setChatUserMock = vi.fn();
const commandDispatchMock = vi.fn(async () => false);

vi.mock("./message-sender.js", () => ({
  configureDingTalkMessageSender: vi.fn(),
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

vi.mock("./client.js", () => ({
  ackMessage: ackMessageMock,
  registerSessionWebhook: registerSessionWebhookMock,
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

function createTextPayload(messageId: string): DWClientDownStream {
  return {
    specVersion: "1.0",
    type: "CALLBACK",
    headers: {
      appId: "app-1",
      connectionId: "conn-1",
      contentType: "application/json",
      messageId,
      time: String(Date.now()),
      topic: "robot",
    },
    data: JSON.stringify({
      conversationId: "cid-1",
      conversationType: "0",
      senderStaffId: "user-1",
      senderId: "user-1",
      senderNick: "User One",
      msgtype: "text",
      text: { content: "你好" },
      sessionWebhook: "https://example.com/webhook",
      robotCode: "robot-1",
    }),
  };
}

function createConfig() {
  return {
    aiCommand: "codex",
    dingtalkAllowedUserIds: ["user-1"],
    dingtalkClientId: "robot-1",
    platforms: {
      dingtalk: {
        enabled: true,
        aiCommand: "codex",
        allowedUserIds: ["user-1"],
      },
    },
  } as never;
}

function createSessionManager() {
  return {
    getWorkDir: vi.fn(() => "/tmp/relaydesk"),
    getConvId: vi.fn(() => "conv-1"),
    getSessionIdForConv: vi.fn(() => "session-1"),
  } as never;
}

describe("DingTalk event handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commandDispatchMock.mockReset();
    commandDispatchMock.mockResolvedValue(false);
  });

  it("ignores duplicate callback ids and only runs the task once", async () => {
    const { setupDingTalkHandlers } = await import("./event-handler.js");

    const handler = setupDingTalkHandlers(createConfig(), createSessionManager());

    await handler.handleEvent(createTextPayload("cb-1"));
    await handler.handleEvent(createTextPayload("cb-1"));

    expect(runAITaskMock).toHaveBeenCalledTimes(1);
    expect(sendFinalMessagesMock).toHaveBeenCalledTimes(1);
    expect(ackMessageMock).toHaveBeenNthCalledWith(1, "cb-1", { queued: "running" });
    expect(ackMessageMock).toHaveBeenNthCalledWith(2, "cb-1", { duplicate: true });
  });

  it("routes generated images and files into the DingTalk native reply sender", async () => {
    runAITaskMock.mockImplementationOnce(async (_deps, _ctx, _prompt, _adapter, callbacks) => {
      await callbacks.sendImage("D:\\coding\\relaydesk\\generated.png");
      await callbacks.sendFile("D:\\coding\\relaydesk\\report.txt");
      await callbacks.sendComplete("ok", "耗时 0.1s");
    });

    const { setupDingTalkHandlers } = await import("./event-handler.js");
    const handler = setupDingTalkHandlers(createConfig(), createSessionManager());

    await handler.handleEvent(createTextPayload("cb-media"));

    await vi.waitFor(() => {
      expect(sendImageReplyMock).toHaveBeenCalledWith(
        "cid-1",
        "D:\\coding\\relaydesk\\generated.png",
        expect.objectContaining({
          chatId: "cid-1",
          conversationType: "0",
          senderStaffId: "user-1",
          senderId: "user-1",
          robotCode: "robot-1",
        }),
      );
      expect(sendFileReplyMock).toHaveBeenCalledWith(
        "cid-1",
        "D:\\coding\\relaydesk\\report.txt",
        expect.objectContaining({
          chatId: "cid-1",
          conversationType: "0",
          senderStaffId: "user-1",
          senderId: "user-1",
          robotCode: "robot-1",
        }),
      );
    });
  });

  it("acks and returns when command dispatch fails", async () => {
    commandDispatchMock.mockRejectedValueOnce(new Error("dispatch failed"));
    const { setupDingTalkHandlers } = await import("./event-handler.js");
    const handler = setupDingTalkHandlers(createConfig(), createSessionManager());

    await handler.handleEvent({
      ...createTextPayload("cb-cmd"),
      data: JSON.stringify({
        conversationId: "cid-1",
        conversationType: "0",
        senderStaffId: "user-1",
        senderId: "user-1",
        senderNick: "User One",
        msgtype: "text",
        text: { content: "/cd /tmp" },
        sessionWebhook: "https://example.com/webhook",
        robotCode: "robot-1",
      }),
    });

    expect(sendTextReplyMock).toHaveBeenCalledWith("cid-1", "命令执行失败，请重试。");
    expect(ackMessageMock).toHaveBeenCalledWith("cb-cmd", { error: "command dispatch failed" });
    expect(runAITaskMock).not.toHaveBeenCalled();
  });
});
