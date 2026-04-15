import { beforeEach, describe, expect, it, vi } from "vitest";

const getActiveChatIdMock = vi.fn();
const resolvePlatformAiCommandMock = vi.fn();
const loggerWarnMock = vi.fn();
const loggerErrorMock = vi.fn();
const loggerDebugMock = vi.fn();
const explainDingTalkInitErrorMock = vi.fn((error: unknown) => String(error));
const sendTelegramLifecycleNoticeMock = vi.fn();
const sendFeishuLifecycleNoticeMock = vi.fn();
const sendQQLifecycleNoticeMock = vi.fn();
const sendWeChatLifecycleNoticeMock = vi.fn();
const sendWeComLifecycleNoticeMock = vi.fn();
const sendDingTalkLifecycleNoticeMock = vi.fn();
const resolveTelegramWorkspaceMock = vi.fn();
const resolveWeComWorkspaceMock = vi.fn();
const startTelegramChannelMock = vi.fn();
const startFeishuChannelMock = vi.fn();
const startQQChannelMock = vi.fn();
const startWeChatChannelMock = vi.fn();
const startWeComChannelMock = vi.fn();
const startDingTalkChannelMock = vi.fn();
const stopTelegramChannelMock = vi.fn();
const stopFeishuChannelMock = vi.fn();
const stopQQChannelMock = vi.fn();
const stopWeChatChannelMock = vi.fn();
const stopWeComChannelMock = vi.fn();
const stopDingTalkChannelMock = vi.fn();

vi.mock("../../state/src/index.js", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: loggerWarnMock,
    error: loggerErrorMock,
    debug: loggerDebugMock,
  })),
  getActiveChatId: getActiveChatIdMock,
  resolvePlatformAiCommand: resolvePlatformAiCommandMock,
  SessionManager: class SessionManager {},
}));

vi.mock("../../channels/src/index.js", () => ({
  explainDingTalkInitError: explainDingTalkInitErrorMock,
  sendDingTalkLifecycleNotice: sendDingTalkLifecycleNoticeMock,
  sendFeishuLifecycleNotice: sendFeishuLifecycleNoticeMock,
  sendQQLifecycleNotice: sendQQLifecycleNoticeMock,
  sendTelegramLifecycleNotice: sendTelegramLifecycleNoticeMock,
  sendWeChatLifecycleNotice: sendWeChatLifecycleNoticeMock,
  sendWeComLifecycleNotice: sendWeComLifecycleNoticeMock,
  resolveTelegramWorkspace: resolveTelegramWorkspaceMock,
  resolveWeComWorkspace: resolveWeComWorkspaceMock,
  startTelegramChannel: startTelegramChannelMock,
  stopTelegramChannel: stopTelegramChannelMock,
  startQQChannel: startQQChannelMock,
  stopQQChannel: stopQQChannelMock,
  startWeChatChannel: startWeChatChannelMock,
  stopWeChatChannel: stopWeChatChannelMock,
  startDingTalkChannel: startDingTalkChannelMock,
  stopDingTalkChannel: stopDingTalkChannelMock,
  startWeComChannel: startWeComChannelMock,
  stopWeComChannel: stopWeComChannelMock,
  startFeishuChannel: startFeishuChannelMock,
  stopFeishuChannel: stopFeishuChannelMock,
}));

describe("platform runtime lifecycle notices", () => {
  beforeEach(() => {
    vi.resetModules();
    getActiveChatIdMock.mockReset();
    resolvePlatformAiCommandMock.mockReset();
    loggerWarnMock.mockReset();
    loggerErrorMock.mockReset();
    loggerDebugMock.mockReset();
    sendTelegramLifecycleNoticeMock.mockReset();
    sendFeishuLifecycleNoticeMock.mockReset();
    sendQQLifecycleNoticeMock.mockReset();
    sendWeChatLifecycleNoticeMock.mockReset();
    sendWeComLifecycleNoticeMock.mockReset();
    sendDingTalkLifecycleNoticeMock.mockReset();
    resolveTelegramWorkspaceMock.mockReset();
    resolveWeComWorkspaceMock.mockReset();
    explainDingTalkInitErrorMock.mockReset();
    startTelegramChannelMock.mockReset();
    startFeishuChannelMock.mockReset();
    startQQChannelMock.mockReset();
    startWeChatChannelMock.mockReset();
    startWeComChannelMock.mockReset();
    startDingTalkChannelMock.mockReset();
    stopTelegramChannelMock.mockReset();
    stopFeishuChannelMock.mockReset();
    stopQQChannelMock.mockReset();
    stopWeChatChannelMock.mockReset();
    stopWeComChannelMock.mockReset();
    stopDingTalkChannelMock.mockReset();
    explainDingTalkInitErrorMock.mockImplementation((error: unknown) => String(error));
  });

  it("does not send lifecycle notices when the target channel has no active chat", async () => {
    getActiveChatIdMock.mockReturnValue(undefined);

    const runtime = await import("./platform-runtime.js");
    await expect(runtime.sendLifecycleNotice("telegram", "worker online")).resolves.toBeUndefined();

    expect(sendTelegramLifecycleNoticeMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it("logs lifecycle notice delivery failures instead of swallowing them silently", async () => {
    getActiveChatIdMock.mockImplementation((channel: string) =>
      channel === "qq" ? "qq-chat-1" : undefined,
    );
    sendQQLifecycleNoticeMock.mockRejectedValue(new Error("send failed"));

    const runtime = await import("./platform-runtime.js");
    await expect(runtime.sendLifecycleNotice("qq", "worker online")).resolves.toBeUndefined();

    expect(sendQQLifecycleNoticeMock).toHaveBeenCalledWith("worker online");
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "Failed to send qq lifecycle notice:",
      expect.any(Error),
    );
    expect(loggerDebugMock).toHaveBeenCalledWith(
      "Lifecycle notice payload:",
      "worker online",
    );
  });

  it("builds and publishes online notices with the resolved route and workspace", async () => {
    getActiveChatIdMock.mockImplementation((channel: string) =>
      channel === "telegram" ? "tg-chat-1" : undefined,
    );
    resolvePlatformAiCommandMock.mockReturnValue("codex");
    resolveTelegramWorkspaceMock.mockReturnValue("/active/worktree");

    const runtime = await import("./platform-runtime.js");
    await runtime.publishOnlineNotices(
      ["telegram"],
      { aiCommand: "codex" } as never,
      "/default/worktree",
      {} as never,
    );

    expect(sendTelegramLifecycleNoticeMock).toHaveBeenCalledTimes(1);
    expect(sendTelegramLifecycleNoticeMock.mock.calls[0]?.[0]).toContain("`codex`");
    expect(sendTelegramLifecycleNoticeMock.mock.calls[0]?.[0]).toContain("/active/worktree");
  });

  it("publishes offline notices for ready channels", async () => {
    getActiveChatIdMock.mockImplementation((channel: string) =>
      channel === "wechat" ? "wechat-chat-1" : undefined,
    );

    const runtime = await import("./platform-runtime.js");
    await runtime.publishOfflineNotices(["wechat"], 5);

    expect(sendWeChatLifecycleNoticeMock).toHaveBeenCalledWith(
      expect.stringContaining("`5 min`"),
    );
  });

  it("keeps stopping later channels when one stop handler fails", async () => {
    stopQQChannelMock.mockRejectedValue(new Error("qq stop failed"));

    const runtime = await import("./platform-runtime.js");
    await expect(
      runtime.stopConfiguredChannels({
        activeChannels: ["telegram", "qq", "dingtalk"],
        handles: {
          telegramHandle: { id: "tg" } as never,
          feishuHandle: { id: "fs" } as never,
          qqHandle: { id: "qq" } as never,
          wechatHandle: { id: "wx" } as never,
          weworkHandle: { id: "ww" } as never,
          dingtalkHandle: { id: "dt" } as never,
        },
      }),
    ).resolves.toBeUndefined();

    expect(stopTelegramChannelMock).toHaveBeenCalledTimes(1);
    expect(stopFeishuChannelMock).not.toHaveBeenCalled();
    expect(stopQQChannelMock).toHaveBeenCalledTimes(1);
    expect(stopWeChatChannelMock).not.toHaveBeenCalled();
    expect(stopWeComChannelMock).not.toHaveBeenCalled();
    expect(stopDingTalkChannelMock).toHaveBeenCalledTimes(1);
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "Failed to stop qq channel:",
      expect.any(Error),
    );
  });

  it("returns startup failures while preserving successfully started channels", async () => {
    startTelegramChannelMock.mockRejectedValue(new Error("bad token"));
    startQQChannelMock.mockResolvedValue({ id: "qq" });

    const runtime = await import("./platform-runtime.js");
    const result = await runtime.startConfiguredChannels(
      { enabledPlatforms: ["telegram", "qq"] } as never,
      {} as never,
      { error: loggerErrorMock } as never,
    );

    expect(result.readyChannels).toEqual(["qq"]);
    expect(result.failedChannels).toEqual([
      { channel: "telegram", message: "bad token" },
    ]);
    expect(result.handles.qqHandle).toEqual({ id: "qq" });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "telegram initialization failed:",
      expect.any(Error),
    );
  });

  it("formats dingtalk startup failures through the dedicated error explainer", async () => {
    startDingTalkChannelMock.mockRejectedValue(new Error("429"));
    explainDingTalkInitErrorMock.mockReturnValue("throttled");

    const runtime = await import("./platform-runtime.js");
    const result = await runtime.startConfiguredChannels(
      { enabledPlatforms: ["dingtalk"] } as never,
      {} as never,
      { error: loggerErrorMock } as never,
    );

    expect(result.failedChannels).toEqual([
      { channel: "dingtalk", message: "throttled" },
    ]);
    expect(explainDingTalkInitErrorMock).toHaveBeenCalledWith(expect.any(Error));
  });
});
