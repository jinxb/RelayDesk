import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createTelegramStreamUpdaterMock,
  runAITaskMock,
  sendFinalMessagesMock,
  sendThinkingMessageMock,
  startTypingLoopMock,
  updateMessageMock,
} = vi.hoisted(() => ({
  createTelegramStreamUpdaterMock: vi.fn(),
  runAITaskMock: vi.fn(),
  sendFinalMessagesMock: vi.fn(async () => {}),
  sendThinkingMessageMock: vi.fn(async () => "stream-1"),
  startTypingLoopMock: vi.fn(() => vi.fn()),
  updateMessageMock: vi.fn(async () => {}),
}));

vi.mock("../../../state/src/index.js", () => ({
  TELEGRAM_THROTTLE_MS: 200,
  buildScopedSessionOwnerId: ({ platform, chatId, userId }: { platform: string; chatId: string; userId: string }) =>
    `scope:${platform}:${chatId}:${userId}:-`,
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  resolvePlatformAiCommand: () => "codex",
  setActiveChatId: vi.fn(),
  setActiveRouteAnchor: vi.fn(),
}));

vi.mock("../../../interaction/src/index.js", () => ({
  AccessControl: class {
    isAllowed() {
      return true;
    }
  },
  CommandHandler: class {
    async dispatch() {
      return false;
    }
  },
  RequestQueue: class {
    enqueue(
      _userId: string,
      _convId: string,
      prompt: string,
      execute: (nextPrompt: string) => Promise<void>,
    ) {
      void execute(prompt);
      return "running";
    }
  },
  buildErrorNote: () => "执行失败",
  buildMediaContext: vi.fn(),
  buildProgressNote: (toolNote?: string) =>
    toolNote ? `输出中...\n${toolNote}` : "输出中...",
  buildSavedMediaPrompt: vi.fn(),
  downloadMediaFromUrl: vi.fn(),
  escapePathForMarkdown: (value: string) => value,
  runAITask: runAITaskMock,
  setChatUser: vi.fn(),
  startTaskCleanup: () => () => {},
}));

vi.mock("./message-sender.js", () => ({
  sendThinkingMessage: sendThinkingMessageMock,
  updateMessage: updateMessageMock,
  sendFinalMessages: sendFinalMessagesMock,
  sendTextReply: vi.fn(async () => {}),
  startTypingLoop: startTypingLoopMock,
  sendImageReply: vi.fn(async () => {}),
  sendDirectorySelection: vi.fn(async () => {}),
}));

vi.mock("../../../agents/src/index.js", () => ({
  getAdapter: () => ({ toolId: "codex" }),
}));

vi.mock("./stream-updater.js", () => ({
  createTelegramStreamUpdater: createTelegramStreamUpdaterMock,
}));

import { setupTelegramHandlers } from "./event-handler.js";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

describe("Telegram completion wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("waits for the stream updater to finish before sending the final message", async () => {
    const finishDeferred = createDeferred<void>();
    const scheduleMock = vi.fn();
    const resetMock = vi.fn();
    createTelegramStreamUpdaterMock.mockReturnValue({
      schedule: scheduleMock,
      finish: vi.fn(() => finishDeferred.promise),
      reset: resetMock,
    });

    runAITaskMock.mockImplementation(
      async (
        _deps: unknown,
        _ctx: unknown,
        _prompt: string,
        _adapter: unknown,
        platformAdapter: {
          streamUpdate: (content: string, toolNote?: string) => void;
          sendComplete: (content: string, note: string) => Promise<void>;
        },
      ) => {
        platformAdapter.streamUpdate("partial output", "Bash");
        await platformAdapter.sendComplete("final answer", "耗时 1.0s");
      },
    );

    const handlers: Array<(ctx: any) => Promise<void>> = [];
    const bot = {
      on(_event: unknown, handler: (ctx: any) => Promise<void>) {
        handlers.push(handler);
        return this;
      },
    };

    setupTelegramHandlers(
      bot as never,
      {
        aiCommand: "codex",
        telegramAllowedUserIds: [],
        platforms: {
          telegram: {
            enabled: true,
            allowedUserIds: [],
          },
        },
      } as never,
      {
        addTurns: () => 1,
        getConvId: () => "conv-1",
        getSessionIdForConv: () => undefined,
        getWorkDir: () => "/tmp/relaydesk",
      } as never,
    );

    const textHandler = handlers[1];
    expect(textHandler).toBeTypeOf("function");

    await textHandler({
      chat: { id: "chat-1" },
      from: { id: "user-1" },
      message: {
        message_id: 7,
        text: "你好",
      },
    });

    await Promise.resolve();
    expect(scheduleMock).toHaveBeenCalled();
    expect(sendFinalMessagesMock).not.toHaveBeenCalled();

    finishDeferred.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(sendFinalMessagesMock).toHaveBeenCalledWith(
      "chat-1",
      "stream-1",
      "final answer",
      "耗时 1.0s",
      "codex",
    );
  });
});
