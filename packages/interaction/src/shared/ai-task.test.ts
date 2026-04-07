import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolAdapter } from "../../../agents/src/index.js";
import { runAITask } from "./ai-task.js";

const { loggerErrorMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
}));

vi.mock("../../../state/src/index.js", async () => {
  const actual = await vi.importActual<typeof import("../../../state/src/index.js")>("../../../state/src/index.js");
  return {
    ...actual,
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: loggerErrorMock,
      debug: vi.fn(),
    })),
  };
});

function createSessionManager(overrides: Record<string, unknown> = {}) {
  return {
    addTurnsForThread: vi.fn(() => 0),
    addTurns: vi.fn(() => 0),
    setSessionIdForThread: vi.fn(),
    setSessionIdForConv: vi.fn(),
    clearSessionForConv: vi.fn(),
    clearActiveToolSession: vi.fn(),
    getModel: vi.fn(() => undefined),
    getConvId: vi.fn(() => "conv-1"),
    peekConvId: vi.fn(() => "conv-1"),
    getRecentTurns: vi.fn(() => []),
    recordUserPrompt: vi.fn(),
    recordAssistantReply: vi.fn(),
    ...overrides,
  };
}

function createConfig(aiCommand: "claude" | "codex" | "codebuddy") {
  return {
    aiCommand,
    platforms: {},
    enabledPlatforms: [],
    claudeTimeoutMs: 600000,
    codexTimeoutMs: 1800000,
    codexIdleTimeoutMs: 600000,
    codebuddyTimeoutMs: 900000,
    codebuddyIdleTimeoutMs: 420000,
    claudeModel: "",
    codexProxy: "",
  } as never;
}

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    chatId: "chat-1",
    workDir: "/tmp/relaydesk",
    sessionId: undefined,
    convId: "conv-1",
    platform: "telegram",
    taskKey: "task-1",
    ...overrides,
  } as never;
}

function createPlatformAdapter(overrides: Record<string, unknown> = {}) {
  return {
    streamUpdate: vi.fn(),
    sendComplete: vi.fn(async () => {}),
    sendError: vi.fn(async () => {}),
    throttleMs: 0,
    onTaskReady: vi.fn(),
    ...overrides,
  } as never;
}

async function collectRunOptions(aiCommand: "codex" | "codebuddy") {
  let receivedOptions: Record<string, unknown> | undefined;
  const toolAdapter: ToolAdapter = {
    toolId: aiCommand,
    run(_prompt, _sessionId, _workDir, callbacks, options) {
      receivedOptions = options as Record<string, unknown>;
      callbacks.onComplete({
        success: true,
        result: "ok",
        accumulated: "ok",
        cost: 0,
        durationMs: 1,
        numTurns: 1,
        toolStats: {},
      });
      return { abort: vi.fn() };
    },
  };

  await runAITask(
    {
      config: createConfig(aiCommand),
      sessionManager: createSessionManager() as never,
    },
    createContext({ platform: "wework" }),
    "hello",
    toolAdapter,
    createPlatformAdapter(),
  );

  return receivedOptions;
}

describe("runAITask", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    loggerErrorMock.mockReset();
  });

  it("keeps the codex session on usage limit errors", async () => {
    const sessionManager = createSessionManager();
    const platformAdapter = createPlatformAdapter();
    const toolAdapter: ToolAdapter = {
      toolId: "codex",
      run(_prompt, _sessionId, _workDir, callbacks) {
        callbacks.onError(
          "You've hit your usage limit. To get more access now, send a request to your admin or try again at 12:56 PM.",
        );
        return { abort: vi.fn() };
      },
    };

    await runAITask(
      {
        config: createConfig("codex"),
        sessionManager: sessionManager as never,
      },
      createContext({
        userId: "u1",
        chatId: "c1",
        workDir: "D:\\coding\\relaydesk",
        sessionId: "sess-1",
        convId: "conv-1",
        platform: "wework",
        taskKey: "task-1",
      }),
      "hello",
      toolAdapter,
      platformAdapter,
    );

    expect(sessionManager.clearSessionForConv).not.toHaveBeenCalled();
    expect(sessionManager.clearActiveToolSession).not.toHaveBeenCalled();
    expect(platformAdapter.sendComplete).not.toHaveBeenCalled();
    expect(platformAdapter.sendError).toHaveBeenCalledWith(expect.stringContaining("usage limit"));
    expect(platformAdapter.streamUpdate).not.toHaveBeenCalled();
  });

  it("keeps the codex session on timeout errors when the task had observable progress", async () => {
    const sessionManager = createSessionManager();
    const platformAdapter = createPlatformAdapter();
    const toolAdapter: ToolAdapter = {
      toolId: "codex",
      run(_prompt, _sessionId, _workDir, callbacks) {
        callbacks.onThinking?.("继续处理中");
        callbacks.onError("Codex 执行空闲超时（600000ms 内无输出），已自动终止");
        return { abort: vi.fn() };
      },
    };

    await runAITask(
      {
        config: createConfig("codex"),
        sessionManager: sessionManager as never,
      },
      createContext({
        userId: "u-timeout-keep",
        convId: "conv-timeout-keep",
        platform: "qq",
      }),
      "继续执行长任务",
      toolAdapter,
      platformAdapter,
    );

    expect(sessionManager.clearSessionForConv).not.toHaveBeenCalled();
    expect(sessionManager.clearActiveToolSession).not.toHaveBeenCalled();
    expect(platformAdapter.sendError).toHaveBeenCalledWith(
      expect.stringContaining("已保留当前 Codex 会话"),
    );
  });

  it("clears the codex session on timeout errors when the task had no observable progress", async () => {
    const sessionManager = createSessionManager();
    const platformAdapter = createPlatformAdapter();
    const toolAdapter: ToolAdapter = {
      toolId: "codex",
      run(_prompt, _sessionId, _workDir, callbacks) {
        callbacks.onError("Codex 执行空闲超时（600000ms 内无输出），已自动终止");
        return { abort: vi.fn() };
      },
    };

    await runAITask(
      {
        config: createConfig("codex"),
        sessionManager: sessionManager as never,
      },
      createContext({
        userId: "u-timeout-reset",
        convId: "conv-timeout-reset",
        platform: "qq",
      }),
      "继续执行长任务",
      toolAdapter,
      platformAdapter,
    );

    expect(sessionManager.clearSessionForConv).toHaveBeenCalledWith(
      "u-timeout-reset",
      "conv-timeout-reset",
      "codex",
      "task_error",
    );
  });

  it("uses the resolved aiCommand for thinking titles instead of the adapter implementation id", async () => {
    const platformAdapter = createPlatformAdapter();
    const toolAdapter: ToolAdapter = {
      toolId: "claude-sdk",
      run(_prompt, _sessionId, _workDir, callbacks) {
        callbacks.onThinking?.("分析中");
        callbacks.onError("stop");
        return { abort: vi.fn() };
      },
    };

    await runAITask(
      {
        config: createConfig("claude"),
        sessionManager: createSessionManager() as never,
      },
      createContext({
        userId: "u2",
        chatId: "c2",
        convId: "conv-2",
        platform: "telegram",
        taskKey: "task-2",
      }),
      "hello",
      toolAdapter,
      platformAdapter,
    );

    expect(platformAdapter.streamUpdate).toHaveBeenCalledWith(
      "ℹ️ 上下文模式：全新上下文\n\n💭 **Claude Code 思考中...**\n\n分析中",
      undefined,
    );
    expect(platformAdapter.sendError).toHaveBeenCalledWith("stop");
  });

  it("forwards generated image callbacks to the platform adapter", async () => {
    const sendImage = vi.fn(async () => {});
    const toolAdapter: ToolAdapter = {
      toolId: "codex",
      run(_prompt, _sessionId, _workDir, callbacks) {
        callbacks.onGeneratedImage?.("/tmp/generated.png");
        callbacks.onComplete({
          success: true,
          result: "ok",
          accumulated: "ok",
          cost: 0,
          durationMs: 1,
          numTurns: 1,
          toolStats: {},
        });
        return { abort: vi.fn() };
      },
    };

    await runAITask(
      {
        config: createConfig("codex"),
        sessionManager: createSessionManager() as never,
      },
      createContext({
        userId: "u3",
        chatId: "c3",
        convId: "conv-3",
        platform: "qq",
        taskKey: "task-3",
      }),
      "hello",
      toolAdapter,
      createPlatformAdapter({ sendImage }),
    );

    expect(sendImage).toHaveBeenCalledWith("/tmp/generated.png");
  });

  it("injects current-task media tool instructions and revokes the token after completion", async () => {
    const revoke = vi.fn();
    const registerCurrentTaskMediaTarget = vi.fn(() => ({
      endpoint: "http://127.0.0.1:40123/v1/media/send-current",
      token: "token-123",
      port: 40123,
      revoke,
    }));
    let receivedPrompt = "";
    let receivedOptions: Record<string, unknown> | undefined;
    const toolAdapter: ToolAdapter = {
      toolId: "codex",
      run(prompt, _sessionId, _workDir, callbacks, options) {
        receivedPrompt = prompt;
        receivedOptions = options as Record<string, unknown>;
        callbacks.onComplete({
          success: true,
          result: "ok",
          accumulated: "ok",
          cost: 0,
          durationMs: 1,
          numTurns: 1,
          toolStats: {},
        });
        return { abort: vi.fn() };
      },
    };

    await runAITask(
      {
        config: createConfig("codex"),
        sessionManager: createSessionManager() as never,
        currentTaskMediaHook: {
          registerCurrentTaskMediaTarget,
        },
      },
      createContext({
        platform: "telegram",
        taskKey: "task-media-1",
        chatId: "chat-media-1",
      }),
      "把刚才截图发给我",
      toolAdapter,
      createPlatformAdapter(),
    );

    expect(registerCurrentTaskMediaTarget).toHaveBeenCalledWith({
      taskKey: "task-media-1",
      platform: "telegram",
      chatId: "chat-media-1",
    });
    expect(receivedPrompt).toContain("【RelayDesk 当前会话附件发送】");
    expect(receivedPrompt).toContain("http://127.0.0.1:40123/v1/media/send-current");
    expect(receivedPrompt).toContain("token-123");
    expect(receivedOptions).toMatchObject({
      chatId: "chat-media-1",
      hookPort: 40123,
      hookToken: "token-123",
    });
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it("keeps current-task media registration for Claude but stops injecting the HTTP prompt instructions", async () => {
    const revoke = vi.fn();
    const registerCurrentTaskMediaTarget = vi.fn(() => ({
      endpoint: "http://127.0.0.1:40123/v1/media/send-current",
      token: "token-123",
      port: 40123,
      revoke,
    }));
    let receivedPrompt = "";
    let receivedOptions: Record<string, unknown> | undefined;
    const toolAdapter: ToolAdapter = {
      toolId: "claude-sdk",
      run(prompt, _sessionId, _workDir, callbacks, options) {
        receivedPrompt = prompt;
        receivedOptions = options as Record<string, unknown>;
        callbacks.onComplete({
          success: true,
          result: "ok",
          accumulated: "ok",
          cost: 0,
          durationMs: 1,
          numTurns: 1,
          toolStats: {},
        });
        return { abort: vi.fn() };
      },
    };

    await runAITask(
      {
        config: createConfig("claude"),
        sessionManager: createSessionManager() as never,
        currentTaskMediaHook: {
          registerCurrentTaskMediaTarget,
        },
      },
      createContext({
        platform: "telegram",
        taskKey: "task-media-claude",
        chatId: "chat-media-claude",
      }),
      "把刚才截图发给我",
      toolAdapter,
      createPlatformAdapter(),
    );

    expect(registerCurrentTaskMediaTarget).toHaveBeenCalledWith({
      taskKey: "task-media-claude",
      platform: "telegram",
      chatId: "chat-media-claude",
    });
    expect(receivedPrompt).toBe("把刚才截图发给我");
    expect(receivedPrompt).not.toContain("【RelayDesk 当前会话附件发送】");
    expect(receivedOptions).toMatchObject({
      chatId: "chat-media-claude",
      hookPort: 40123,
      hookToken: "token-123",
    });
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it("forwards generated file callbacks to the platform adapter", async () => {
    const sendFile = vi.fn(async () => {});
    const toolAdapter: ToolAdapter = {
      toolId: "codex",
      run(_prompt, _sessionId, _workDir, callbacks) {
        callbacks.onGeneratedFile?.("/tmp/report.txt");
        callbacks.onComplete({
          success: true,
          result: "ok",
          accumulated: "ok",
          cost: 0,
          durationMs: 1,
          numTurns: 1,
          toolStats: {},
        });
        return { abort: vi.fn() };
      },
    };

    await runAITask(
      {
        config: createConfig("codex"),
        sessionManager: createSessionManager() as never,
      },
      createContext({
        userId: "u4",
        chatId: "c4",
        convId: "conv-4",
        platform: "wework",
        taskKey: "task-4",
      }),
      "hello",
      toolAdapter,
      createPlatformAdapter({ sendFile }),
    );

    expect(sendFile).toHaveBeenCalledWith("/tmp/report.txt");
  });

  it("passes separate total timeout and idle timeout settings to adapters", async () => {
    const codexOptions = await collectRunOptions("codex");
    const codebuddyOptions = await collectRunOptions("codebuddy");

    expect(codexOptions).toMatchObject({
      timeoutMs: 1800000,
      idleTimeoutMs: 600000,
    });
    expect(codebuddyOptions).toMatchObject({
      timeoutMs: 900000,
      idleTimeoutMs: 420000,
    });
  });

  it("injects RelayDesk continuity context when native session is unavailable", async () => {
    const sessionManager = createSessionManager({
      getRecentTurns: vi.fn(() => [
        { role: "user", content: "先分析一下这个仓库", createdAt: 1 },
        { role: "assistant", content: "好的，我先看目录结构。", createdAt: 2 },
      ]),
    });
    let receivedPrompt = "";
    const toolAdapter: ToolAdapter = {
      toolId: "codex",
      run(prompt, _sessionId, _workDir, callbacks) {
        receivedPrompt = prompt;
        callbacks.onComplete({
          success: true,
          result: "继续分析结果",
          accumulated: "继续分析结果",
          cost: 0,
          durationMs: 1,
          numTurns: 1,
          toolStats: {},
        });
        return { abort: vi.fn() };
      },
    };

    await runAITask(
      {
        config: createConfig("codex"),
        sessionManager: sessionManager as never,
      },
      createContext({
        userId: "scope:telegram:chat:user:-",
        sessionId: undefined,
        convId: "conv-1",
        platform: "telegram",
      }),
      "继续",
      toolAdapter,
      createPlatformAdapter(),
    );

    expect(receivedPrompt).toContain("【RelayDesk 上下文续接】");
    expect(receivedPrompt).toContain("当前用户消息：");
    expect(sessionManager.recordUserPrompt).toHaveBeenCalledWith("scope:telegram:chat:user:-", "继续");
    expect(sessionManager.recordAssistantReply).toHaveBeenCalledWith("scope:telegram:chat:user:-", "继续分析结果");
  });

  it("logs generated image delivery failures without breaking task completion", async () => {
    const sendImage = vi.fn(async () => {
      throw new Error("image send failed");
    });
    const platformAdapter = createPlatformAdapter({ sendImage });
    const toolAdapter: ToolAdapter = {
      toolId: "codex",
      run(_prompt, _sessionId, _workDir, callbacks) {
        callbacks.onGeneratedImage?.("/tmp/generated.png");
        callbacks.onComplete({
          success: true,
          result: "ok",
          accumulated: "ok",
          cost: 0,
          durationMs: 1,
          numTurns: 1,
          toolStats: {},
        });
        return { abort: vi.fn() };
      },
    };

    await runAITask(
      {
        config: createConfig("codex"),
        sessionManager: createSessionManager() as never,
      },
      createContext({
        userId: "u5",
        chatId: "c5",
        platform: "wechat",
        taskKey: "task-5",
      }),
      "hello",
      toolAdapter,
      platformAdapter,
    );
    await Promise.resolve();

    expect(platformAdapter.sendComplete).toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.stringContaining("Generated image delivery failed"),
      expect.any(Error),
    );
  });

  it("logs generated file delivery failures without breaking task completion", async () => {
    const sendFile = vi.fn(async () => {
      throw new Error("file send failed");
    });
    const platformAdapter = createPlatformAdapter({ sendFile });
    const toolAdapter: ToolAdapter = {
      toolId: "codex",
      run(_prompt, _sessionId, _workDir, callbacks) {
        callbacks.onGeneratedFile?.("/tmp/report.txt");
        callbacks.onComplete({
          success: true,
          result: "ok",
          accumulated: "ok",
          cost: 0,
          durationMs: 1,
          numTurns: 1,
          toolStats: {},
        });
        return { abort: vi.fn() };
      },
    };

    await runAITask(
      {
        config: createConfig("codex"),
        sessionManager: createSessionManager() as never,
      },
      createContext({
        userId: "u6",
        chatId: "c6",
        platform: "qq",
        taskKey: "task-6",
      }),
      "hello",
      toolAdapter,
      platformAdapter,
    );
    await Promise.resolve();

    expect(platformAdapter.sendComplete).toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.stringContaining("Generated file delivery failed"),
      expect.any(Error),
    );
  });
});
