import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cleanupAdaptersMock,
  createLoggerMock,
  flushActiveChatsMock,
  getConfiguredAiCommandsMock,
  initAdaptersMock,
  initLoggerMock,
  loadActiveChatsMock,
  loadConfigMock,
  publishOfflineNoticesMock,
  publishOnlineNoticesMock,
  startConfiguredChannelsMock,
  startRuntimeMediaHookServerMock,
  stopConfiguredChannelsMock,
  engageRuntimeKeepAwakeMock,
  sessionClearAllMock,
  sessionDestroyMock,
} = vi.hoisted(() => ({
  cleanupAdaptersMock: vi.fn(),
  createLoggerMock: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  flushActiveChatsMock: vi.fn(),
  getConfiguredAiCommandsMock: vi.fn(() => ["codex"]),
  initAdaptersMock: vi.fn(),
  initLoggerMock: vi.fn(),
  loadActiveChatsMock: vi.fn(),
  loadConfigMock: vi.fn(),
  publishOfflineNoticesMock: vi.fn(),
  publishOnlineNoticesMock: vi.fn(),
  startConfiguredChannelsMock: vi.fn(),
  startRuntimeMediaHookServerMock: vi.fn(),
  stopConfiguredChannelsMock: vi.fn(),
  engageRuntimeKeepAwakeMock: vi.fn(),
  sessionClearAllMock: vi.fn(),
  sessionDestroyMock: vi.fn(),
}));

vi.mock("../../state/src/index.js", () => ({
  APP_HOME: "/tmp/relaydesk",
  PORT_FILE_NAME: "relaydesk.port",
  SHUTDOWN_PORT: 39281,
  SessionManager: class SessionManager {
    constructor() {}

    clearAllCliSessionIds() {
      sessionClearAllMock();
    }

    destroy() {
      sessionDestroyMock();
    }
  },
  closeLogger: vi.fn(),
  createLogger: createLoggerMock,
  flushActiveChats: flushActiveChatsMock,
  getConfiguredAiCommands: getConfiguredAiCommandsMock,
  initLogger: initLoggerMock,
  loadActiveChats: loadActiveChatsMock,
  loadConfig: loadConfigMock,
}));

vi.mock("../../agents/src/index.js", () => ({
  cleanupAdapters: cleanupAdaptersMock,
  initAdapters: initAdaptersMock,
}));

vi.mock("./platform-runtime.js", () => ({
  publishOfflineNotices: publishOfflineNoticesMock,
  publishOnlineNotices: publishOnlineNoticesMock,
  startConfiguredChannels: startConfiguredChannelsMock,
  stopConfiguredChannels: stopConfiguredChannelsMock,
}));

vi.mock("./runtime-keepawake.js", () => ({
  engageRuntimeKeepAwake: engageRuntimeKeepAwakeMock,
}));

vi.mock("./runtime-media-hook.js", () => ({
  startRuntimeMediaHookServer: startRuntimeMediaHookServerMock,
}));

vi.mock("./runtime-shutdown.js", () => ({
  handleRuntimeShutdownFailure: vi.fn(),
}));

import { runWorkerRuntime } from "./worker-runtime.js";

describe("worker runtime startup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadConfigMock.mockReturnValue({
      logDir: "/tmp/relaydesk/logs",
      logLevel: "INFO",
      enabledPlatforms: ["telegram", "qq"],
      runtime: { keepAwake: false },
      claudeWorkDir: "/tmp/work",
    });
    initAdaptersMock.mockResolvedValue(undefined);
    stopConfiguredChannelsMock.mockResolvedValue(undefined);
    startRuntimeMediaHookServerMock.mockResolvedValue({
      port: 44950,
      registerCurrentTaskMediaTarget: vi.fn(),
      close: vi.fn(async () => {}),
    });
  });

  it("fails startup when any enabled channel fails and cleans up partial startup state", async () => {
    const handles = {
      telegramHandle: null,
      feishuHandle: null,
      qqHandle: { id: "qq" },
      wechatHandle: null,
      weworkHandle: null,
      dingtalkHandle: null,
    };
    startConfiguredChannelsMock.mockResolvedValue({
      handles,
      readyChannels: ["qq"],
      failedChannels: [{ channel: "telegram", message: "bad token" }],
    });

    await expect(runWorkerRuntime()).rejects.toThrow(
      "RelayDesk worker failed to initialize all enabled channels. telegram: bad token",
    );

    expect(sessionClearAllMock).toHaveBeenCalledTimes(1);
    expect(stopConfiguredChannelsMock).toHaveBeenCalledWith(handles);
    expect(sessionDestroyMock).toHaveBeenCalledTimes(1);
    expect(cleanupAdaptersMock).toHaveBeenCalledTimes(1);
    expect(publishOnlineNoticesMock).not.toHaveBeenCalled();
    expect(engageRuntimeKeepAwakeMock).not.toHaveBeenCalled();
  });
});
