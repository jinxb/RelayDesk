import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendFileReplyMock, sendTextReplyMock } = vi.hoisted(() => ({
  sendFileReplyMock: vi.fn(async () => {}),
  sendTextReplyMock: vi.fn(async () => {}),
}));

vi.mock("./message-sender.js", () => ({
  sendThinkingMessage: vi.fn(async () => "stream-1"),
  updateMessage: vi.fn(async () => {}),
  sendFinalMessages: vi.fn(async () => {}),
  sendFileReply: sendFileReplyMock,
  sendTextReply: sendTextReplyMock,
  startTypingLoop: vi.fn(() => vi.fn()),
  sendImageReply: vi.fn(async () => {}),
  sendDirectorySelection: vi.fn(async () => {}),
}));

import {
  extractThinkingTextUpdate,
  parseTelegramControlAction,
  setupTelegramHandlers,
} from "./event-handler.js";
import { buildScopedSessionOwnerId } from "../../../state/src/index.js";
import { createTelegramDirectoryCallbackData } from "./directory-actions.js";

describe("Telegram helpers", () => {
  it("parses /cd callback payloads", () => {
    expect(
      parseTelegramControlAction(`cd:user-1:${encodeURIComponent("/tmp/relaydesk")}`),
    ).toEqual({
      kind: "cd",
      userId: "user-1",
      path: "/tmp/relaydesk",
    });
  });

  it("extracts tool-agnostic thinking updates", () => {
    expect(
      extractThinkingTextUpdate("💭 **Claude Code 思考中...**\n\n分析中"),
    ).toBe("分析中");
  });

  it("extracts thinking updates when continuity mode prefix is present", () => {
    expect(
      extractThinkingTextUpdate("ℹ️ 上下文模式：RelayDesk 续接\n\n💭 **Codex 思考中...**\n\n继续分析"),
    ).toBe("继续分析");
  });

  it("parses tokenized directory callback payloads", () => {
    const data = createTelegramDirectoryCallbackData("user-1", "/tmp/relaydesk");
    expect(parseTelegramControlAction(data)).toEqual({
      kind: "cd",
      userId: "user-1",
      path: "/tmp/relaydesk",
    });
  });
});

describe("Telegram callback actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("switches workdir when a directory callback is clicked", async () => {
    const handlers = new Map<string, (ctx: any) => Promise<void>>();
    const bot = {
      on(event: unknown, handler: (ctx: any) => Promise<void>) {
        if (typeof event === "string") {
          handlers.set(event, handler);
        }
        return this;
      },
    };

    const sessionManager = {
      setWorkDir: vi.fn(async () => "/tmp/relaydesk"),
    };

    setupTelegramHandlers(
      bot as never,
      {
        aiCommand: "claude",
        telegramAllowedUserIds: [],
        platforms: {
          telegram: {
            enabled: true,
            allowedUserIds: [],
          },
        },
      } as never,
      sessionManager as never,
    );

    const callbackHandler = handlers.get("callback_query");
    expect(callbackHandler).toBeTypeOf("function");

    const answerCbQuery = vi.fn(async () => {});
    await callbackHandler?.({
      callbackQuery: {
        data: `cd:user-1:${encodeURIComponent("/tmp/relaydesk")}`,
      },
      from: { id: "user-1" },
      chat: { id: "chat-1" },
      answerCbQuery,
    });

    expect(sessionManager.setWorkDir).toHaveBeenCalledWith(
      buildScopedSessionOwnerId({
        platform: "telegram",
        chatId: "chat-1",
        userId: "user-1",
      }),
      "/tmp/relaydesk",
    );
    expect(sendTextReplyMock).toHaveBeenCalledWith(
      "chat-1",
      expect.stringContaining("工作目录已切换到"),
    );
    expect(answerCbQuery).toHaveBeenCalledWith("已切换目录");
  });

  it("accepts scope-based directory callbacks for the current chat", async () => {
    const handlers = new Map<string, (ctx: any) => Promise<void>>();
    const bot = {
      on(event: unknown, handler: (ctx: any) => Promise<void>) {
        if (typeof event === "string") {
          handlers.set(event, handler);
        }
        return this;
      },
    };

    const sessionManager = {
      setWorkDir: vi.fn(async () => "/tmp/scoped"),
    };

    setupTelegramHandlers(
      bot as never,
      {
        aiCommand: "claude",
        telegramAllowedUserIds: [],
        platforms: {
          telegram: {
            enabled: true,
            allowedUserIds: [],
          },
        },
      } as never,
      sessionManager as never,
    );

    const callbackHandler = handlers.get("callback_query");
    const answerCbQuery = vi.fn(async () => {});
    const scopeId = buildScopedSessionOwnerId({
      platform: "telegram",
      chatId: "chat-1",
      userId: "user-1",
    });
    const callbackData = createTelegramDirectoryCallbackData(scopeId, "/tmp/scoped");

    await callbackHandler?.({
      callbackQuery: {
        data: callbackData,
      },
      from: { id: "user-1" },
      chat: { id: "chat-1" },
      answerCbQuery,
    });

    expect(sessionManager.setWorkDir).toHaveBeenCalledWith(scopeId, "/tmp/scoped");
    expect(answerCbQuery).toHaveBeenCalledWith("已切换目录");
  });
});
