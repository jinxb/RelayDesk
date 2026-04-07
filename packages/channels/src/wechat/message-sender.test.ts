import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendWeChatTextMessageMock = vi.fn(async () => {});
const sendWeChatTypingStatusMock = vi.fn(async () => {});
const sendWeChatNativeMediaFileMock = vi.fn(async () => {});
const getWeChatRuntimeConfigMock = vi.fn(() => ({
  baseUrl: "https://ilink.example.com/",
  token: "wx-token",
}));
const getWeChatContextTokenMock = vi.fn(() => "ctx-1");
const getWeChatTypingTicketMock = vi.fn(() => undefined);
const refreshWeChatTypingTicketMock = vi.fn(async () => "typing-1");

vi.mock("./api.js", () => ({
  sendWeChatTextMessage: sendWeChatTextMessageMock,
  sendWeChatTypingStatus: sendWeChatTypingStatusMock,
}));

vi.mock("./runtime.js", () => ({
  getWeChatRuntimeConfig: getWeChatRuntimeConfigMock,
  getWeChatContextToken: getWeChatContextTokenMock,
  getWeChatTypingTicket: getWeChatTypingTicketMock,
  refreshWeChatTypingTicket: refreshWeChatTypingTicketMock,
}));

vi.mock("./send-media.js", () => ({
  sendWeChatNativeMediaFile: sendWeChatNativeMediaFileMock,
  resolveWeChatGeneratedMediaKind: vi.fn((filePath: string) => {
    if (filePath.endsWith(".mp4")) return "video";
    if (filePath.endsWith(".mp3")) return "voice";
    if (filePath.endsWith(".png")) return "image";
    return "file";
  }),
}));

describe("WeChat message sender", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();
    getWeChatRuntimeConfigMock.mockReturnValue({
      baseUrl: "https://ilink.example.com/",
      token: "wx-token",
    });
    getWeChatContextTokenMock.mockReturnValue("ctx-1");
    getWeChatTypingTicketMock.mockReturnValue(undefined);
    refreshWeChatTypingTicketMock.mockResolvedValue("typing-1");
    sendWeChatNativeMediaFileMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends text replies through ilink/sendmessage with the runtime context token", async () => {
    const sender = await import("./message-sender.js");

    await sender.sendTextReply("wechat-user-1", "你好");

    expect(sendWeChatTextMessageMock).toHaveBeenCalledTimes(1);
    expect(sendWeChatTextMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://ilink.example.com/",
        token: "wx-token",
        toUserId: "wechat-user-1",
        contextToken: "ctx-1",
      }),
    );
    expect(sendWeChatTextMessageMock.mock.calls[0]?.[0]?.text).toContain("你好");
  });

  it("sends final messages as text replies instead of throwing pending errors", async () => {
    const sender = await import("./message-sender.js");

    await sender.sendFinalMessages(
      "wechat-user-1",
      "msg-1",
      "最终结果",
      "耗时 1s",
      "codex",
    );

    expect(sendWeChatTextMessageMock).toHaveBeenCalledTimes(1);
    expect(sendWeChatTextMessageMock.mock.calls[0]?.[0]?.text).toContain("最终结果");
    expect(sendWeChatTextMessageMock.mock.calls[0]?.[0]?.text).toContain("Codex · 耗时 1s");
    expect(sendWeChatTextMessageMock.mock.calls[0]?.[0]?.text).not.toContain("Codex - 完成");
  });

  it("sends generated images through the native WeChat media helper", async () => {
    const sender = await import("./message-sender.js");

    await sender.sendImageReply("wechat-user-1", "C:\\images\\out.png");

    expect(sendWeChatNativeMediaFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toUserId: "wechat-user-1",
        filePath: "C:\\images\\out.png",
        contextToken: "ctx-1",
      }),
    );
  });

  it("sends generated videos through the native WeChat media helper", async () => {
    const sender = await import("./message-sender.js");

    await sender.sendFileReply("wechat-user-1", "/tmp/reply.mp4");

    expect(sendWeChatNativeMediaFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toUserId: "wechat-user-1",
        filePath: "/tmp/reply.mp4",
      }),
    );
  });

  it("falls back to explicit text for generated voice files", async () => {
    const sender = await import("./message-sender.js");

    await sender.sendFileReply("wechat-user-1", "/tmp/reply.mp3");

    expect(sendWeChatNativeMediaFileMock).not.toHaveBeenCalled();
    expect(sendWeChatTextMessageMock).toHaveBeenCalledTimes(1);
    expect(sendWeChatTextMessageMock.mock.calls[0]?.[0]?.text).toContain("Generated voice saved at: /tmp/reply.mp3");
  });

  it("falls back to explicit text when native image send fails", async () => {
    sendWeChatNativeMediaFileMock.mockRejectedValueOnce(new Error("upload failed"));
    const sender = await import("./message-sender.js");

    await sender.sendImageReply("wechat-user-1", "/tmp/out.png");

    expect(sendWeChatTextMessageMock).toHaveBeenCalledTimes(1);
    expect(sendWeChatTextMessageMock.mock.calls[0]?.[0]?.text).toContain("/tmp/out.png");
  });

  it("starts and stops WeChat typing status updates", async () => {
    const sender = await import("./message-sender.js");

    const stop = sender.startTypingLoop("wechat-user-1");
    await vi.runOnlyPendingTimersAsync();

    expect(refreshWeChatTypingTicketMock).toHaveBeenCalledWith("wechat-user-1");
    expect(sendWeChatTypingStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ilinkUserId: "wechat-user-1",
        typingTicket: "typing-1",
        status: 1,
      }),
    );

    stop();
    await vi.runOnlyPendingTimersAsync();

    expect(sendWeChatTypingStatusMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ilinkUserId: "wechat-user-1",
        typingTicket: "typing-1",
        status: 2,
      }),
    );
  });
});
