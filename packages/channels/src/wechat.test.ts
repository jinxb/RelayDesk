import { beforeEach, describe, expect, it, vi } from "vitest";

const initWeChatMock = vi.fn();
const stopWeChatMock = vi.fn();
const setupWeChatHandlersMock = vi.fn();
const sendWeChatNoticeMock = vi.fn(async () => {});
const getActiveChatIdMock = vi.fn();
const loggerInfoMock = vi.fn();

vi.mock("./wechat/client.js", () => ({
  initWeChat: initWeChatMock,
  stopWeChat: stopWeChatMock,
}));

vi.mock("./wechat/event-handler.js", () => ({
  setupWeChatHandlers: setupWeChatHandlersMock,
}));

vi.mock("./wechat/message-sender.js", () => ({
  sendTextReply: sendWeChatNoticeMock,
}));

vi.mock("../../state/src/index.js", async () => {
  const actual = await vi.importActual("../../state/src/index.js");
  return {
    ...actual,
    createLogger: vi.fn(() => ({
      info: loggerInfoMock,
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
    getActiveChatId: getActiveChatIdMock,
  };
});

describe("WeChat channel bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    initWeChatMock.mockReset();
    stopWeChatMock.mockReset();
    setupWeChatHandlersMock.mockReset();
    sendWeChatNoticeMock.mockReset();
    getActiveChatIdMock.mockReset();
    loggerInfoMock.mockReset();
  });

  it("stops the handler when initWeChat fails", async () => {
    const handle = {
      stop: vi.fn(),
      getRunningTaskCount: vi.fn(() => 0),
      handleEvent: vi.fn(async () => {}),
    };
    setupWeChatHandlersMock.mockReturnValue(handle);
    initWeChatMock.mockRejectedValue(new Error("runtime migration is not implemented"));

    const channel = await import("./wechat.js");

    await expect(
      channel.startWeChatChannel({} as never, {} as never),
    ).rejects.toThrow("runtime migration is not implemented");
    expect(handle.stop).toHaveBeenCalledTimes(1);
  });

  it("returns the handler when initWeChat succeeds", async () => {
    const handle = {
      stop: vi.fn(),
      getRunningTaskCount: vi.fn(() => 0),
      handleEvent: vi.fn(async () => {}),
    };
    setupWeChatHandlersMock.mockReturnValue(handle);
    initWeChatMock.mockResolvedValue(undefined);

    const channel = await import("./wechat.js");

    await expect(
      channel.startWeChatChannel({} as never, {} as never),
    ).resolves.toBe(handle);
    expect(initWeChatMock).toHaveBeenCalledWith(
      expect.anything(),
      handle.handleEvent,
    );
    expect(handle.stop).not.toHaveBeenCalled();
  });

  it("stops both handler and client on shutdown", async () => {
    const handle = {
      stop: vi.fn(),
      getRunningTaskCount: vi.fn(() => 0),
      handleEvent: vi.fn(async () => {}),
    };

    const channel = await import("./wechat.js");
    channel.stopWeChatChannel(handle);

    expect(handle.stop).toHaveBeenCalledTimes(1);
    expect(stopWeChatMock).toHaveBeenCalledTimes(1);
  });

  it("sends lifecycle notices through the WeChat text sender when an active chat exists", async () => {
    getActiveChatIdMock.mockReturnValue("wechat-chat-1");

    const channel = await import("./wechat.js");
    await expect(
      channel.sendWeChatLifecycleNotice("worker online"),
    ).resolves.toBeUndefined();

    expect(sendWeChatNoticeMock).toHaveBeenCalledWith("wechat-chat-1", "worker online");
    expect(loggerInfoMock).toHaveBeenCalledTimes(1);
    expect(loggerInfoMock.mock.calls[0]?.[0]).toContain("lifecycle notice sent");
  });
});
