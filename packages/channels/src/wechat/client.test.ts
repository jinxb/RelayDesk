import { beforeEach, describe, expect, it, vi } from "vitest";

const startWeChatRuntimeMock = vi.fn();
const stopWeChatRuntimeMock = vi.fn();
const getWeChatRuntimeStateMock = vi.fn(() => "disconnected");

vi.mock("./runtime.js", () => ({
  startWeChatRuntime: startWeChatRuntimeMock,
  stopWeChatRuntime: stopWeChatRuntimeMock,
  getWeChatRuntimeState: getWeChatRuntimeStateMock,
}));

describe("WeChat client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWeChatRuntimeStateMock.mockReturnValue("disconnected");
  });

  it("proxies the current channel state from the runtime", async () => {
    getWeChatRuntimeStateMock.mockReturnValue("connected");

    const client = await import("./client.js");

    expect(client.getChannelState()).toBe("connected");
  });

  it("rejects WeChat configuration when token or baseUrl is missing", async () => {
    const client = await import("./client.js");

    await expect(
      client.initWeChat(
        {
          logDir: "/tmp/logs",
        } as never,
        async () => {},
      ),
    ).rejects.toThrow("token and baseUrl");
    expect(startWeChatRuntimeMock).not.toHaveBeenCalled();
  });

  it("starts the ilink runtime when valid WeChat config is present", async () => {
    const client = await import("./client.js");
    const handleEvent = vi.fn(async () => {});
    const onStateChange = vi.fn();

    await expect(
      client.initWeChat(
        {
          wechatToken: "token-1",
          wechatBaseUrl: "https://ilink.example.com",
          logDir: "/tmp/logs",
        } as never,
        handleEvent,
        onStateChange,
      ),
    ).resolves.toBeUndefined();

    expect(startWeChatRuntimeMock).toHaveBeenCalledWith({
      baseUrl: "https://ilink.example.com",
      token: "token-1",
      eventHandler: handleEvent,
      onStateChange,
    });
  });

  it("stops the runtime cleanly", async () => {
    const client = await import("./client.js");

    expect(() => client.stopWeChat()).not.toThrow();
    expect(stopWeChatRuntimeMock).toHaveBeenCalledTimes(1);
  });
});
