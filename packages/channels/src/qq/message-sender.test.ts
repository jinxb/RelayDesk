import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendPrivateMessageMock = vi.fn();
const sendGroupMessageMock = vi.fn();
const sendChannelMessageMock = vi.fn();
const sendPrivateImageMock = vi.fn();
const sendGroupImageMock = vi.fn();
const sendPrivateFileMock = vi.fn();
const sendGroupFileMock = vi.fn();
const sendPrivateTypingMock = vi.fn();

vi.mock("./client.js", () => ({
  getQQBot: () => ({
    sendPrivateMessage: sendPrivateMessageMock,
    sendGroupMessage: sendGroupMessageMock,
    sendChannelMessage: sendChannelMessageMock,
    sendPrivateImage: sendPrivateImageMock,
    sendGroupImage: sendGroupImageMock,
    sendPrivateFile: sendPrivateFileMock,
    sendGroupFile: sendGroupFileMock,
    sendPrivateTyping: sendPrivateTypingMock,
  }),
}));

describe("QQ message sender", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    sendPrivateMessageMock.mockReset();
    sendGroupMessageMock.mockReset();
    sendChannelMessageMock.mockReset();
    sendPrivateImageMock.mockReset();
    sendGroupImageMock.mockReset();
    sendPrivateFileMock.mockReset();
    sendGroupFileMock.mockReset();
    sendPrivateTypingMock.mockReset();
    sendPrivateMessageMock.mockResolvedValue(undefined);
    sendGroupMessageMock.mockResolvedValue(undefined);
    sendChannelMessageMock.mockResolvedValue(undefined);
    sendPrivateImageMock.mockResolvedValue(undefined);
    sendGroupImageMock.mockResolvedValue(undefined);
    sendPrivateFileMock.mockResolvedValue(undefined);
    sendGroupFileMock.mockResolvedValue(undefined);
    sendPrivateTypingMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends group images through the native QQ media path", async () => {
    const sender = await import("./message-sender.js");

    await sender.sendImageReply("group:group-1", "C:\\images\\out.png");

    expect(sendGroupImageMock).toHaveBeenCalledTimes(1);
    expect(sendGroupImageMock.mock.calls[0][0]).toBe("group-1");
    expect(sendGroupImageMock.mock.calls[0][1]).toBe("C:\\images\\out.png");
    expect(sendGroupMessageMock).not.toHaveBeenCalled();
  });

  it("keeps channel image replies on the documented text fallback path", async () => {
    const sender = await import("./message-sender.js");

    await sender.sendImageReply("channel:channel-1", "C:\\images\\out.png");

    expect(sendChannelMessageMock).toHaveBeenCalledTimes(1);
    expect(sendChannelMessageMock.mock.calls[0][0]).toBe("channel-1");
    expect(sendChannelMessageMock.mock.calls[0][1]).toContain("QQ 频道当前不支持原生图片回传");
    expect(sendChannelMessageMock.mock.calls[0][1]).toContain("C:\\images\\out.png");
    expect(sendGroupImageMock).not.toHaveBeenCalled();
  });

  it("sends group files through the native QQ media path", async () => {
    const sender = await import("./message-sender.js");

    await sender.sendFileReply("group:group-1", "C:\\files\\report.txt");

    expect(sendGroupFileMock).toHaveBeenCalledTimes(1);
    expect(sendGroupFileMock.mock.calls[0][0]).toBe("group-1");
    expect(sendGroupFileMock.mock.calls[0][1]).toBe("C:\\files\\report.txt");
    expect(sendGroupMessageMock).not.toHaveBeenCalled();
  });

  it("keeps channel file replies on the documented text fallback path", async () => {
    const sender = await import("./message-sender.js");

    await sender.sendFileReply("channel:channel-1", "C:\\files\\report.txt");

    expect(sendChannelMessageMock).toHaveBeenCalledTimes(1);
    expect(sendChannelMessageMock.mock.calls[0][1]).toContain("QQ 频道当前不支持原生文件回传");
    expect(sendChannelMessageMock.mock.calls[0][1]).toContain("C:\\files\\report.txt");
  });

  it("ignores intermediate stream updates and sends only the final reply", async () => {
    const sender = await import("./message-sender.js");

    const messageId = await sender.sendThinkingMessage("private:user-1", "reply-1", "codex");
    await sender.updateMessage("private:user-1", messageId, "第一段", "streaming", undefined, "codex");
    await sender.updateMessage("private:user-1", messageId, "第一段\n第二段", "streaming", "耗时 1.2s", "codex");
    await sender.sendFinalMessages("private:user-1", messageId, "最终答案", "耗时 1.2s", "codex");

    expect(sendPrivateMessageMock).toHaveBeenCalledTimes(2);
    expect(sendPrivateMessageMock.mock.calls[0][0]).toBe("user-1");
    expect(sendPrivateMessageMock.mock.calls[0][1]).toContain("Codex - 思考中");
    expect(sendPrivateMessageMock.mock.calls[0][1]).toContain("正在处理，请稍候");
    expect(sendPrivateMessageMock.mock.calls[0][2]).toBe("reply-1");
    expect(sendPrivateMessageMock.mock.calls[1][0]).toBe("user-1");
    expect(sendPrivateMessageMock.mock.calls[1][1]).toContain("最终答案");
    expect(sendPrivateMessageMock.mock.calls[1][1]).toContain("Codex · 耗时 1.2s");
    expect(sendPrivateMessageMock.mock.calls[1][1]).not.toContain("Codex - 完成");
    expect(sendPrivateMessageMock.mock.calls[1][1]).not.toContain("第一段");
    expect(sendPrivateMessageMock.mock.calls[1][2]).toBe("reply-1");
  });

  it("falls back to an active QQ send when passive final reply fails", async () => {
    sendPrivateMessageMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("passive send failed"))
      .mockResolvedValueOnce(undefined);
    const sender = await import("./message-sender.js");

    const messageId = await sender.sendThinkingMessage("private:user-1", "reply-1", "codex");
    await sender.sendFinalMessages("private:user-1", messageId, "最终答案", "耗时 1.2s", "codex");

    expect(sendPrivateMessageMock).toHaveBeenCalledTimes(3);
    expect(sendPrivateMessageMock.mock.calls[0][2]).toBe("reply-1");
    expect(sendPrivateMessageMock.mock.calls[1][2]).toBe("reply-1");
    expect(sendPrivateMessageMock.mock.calls[2][2]).toBeUndefined();
  });

  it("falls back to an active QQ send when passive error reply fails", async () => {
    sendPrivateMessageMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("passive error send failed"))
      .mockResolvedValueOnce(undefined);
    const sender = await import("./message-sender.js");

    const messageId = await sender.sendThinkingMessage("private:user-1", "reply-1", "codex");
    await sender.sendErrorMessage("private:user-1", messageId, "出错了", "codex");

    expect(sendPrivateMessageMock).toHaveBeenCalledTimes(3);
    expect(sendPrivateMessageMock.mock.calls[0][2]).toBe("reply-1");
    expect(sendPrivateMessageMock.mock.calls[1][2]).toBe("reply-1");
    expect(sendPrivateMessageMock.mock.calls[2][2]).toBeUndefined();
  });

  it("sends a visible thinking placeholder before the final QQ reply", async () => {
    const sender = await import("./message-sender.js");

    await sender.sendThinkingMessage("group:group-1", "reply-1", "codex");

    expect(sendGroupMessageMock).toHaveBeenCalledTimes(1);
    expect(sendGroupMessageMock.mock.calls[0][0]).toBe("group-1");
    expect(sendGroupMessageMock.mock.calls[0][1]).toContain("Codex - 思考中");
    expect(sendGroupMessageMock.mock.calls[0][1]).toContain("正在处理，请稍候");
    expect(sendGroupMessageMock.mock.calls[0][2]).toBe("reply-1");
  });

  it("emits private typing notifications while a QQ private task is running", async () => {
    const sender = await import("./message-sender.js");

    const stop = sender.startTypingLoop("private:user-1", "reply-1");
    expect(sendPrivateTypingMock).toHaveBeenCalledTimes(1);
    expect(sendPrivateTypingMock).toHaveBeenCalledWith("user-1", "reply-1");

    vi.advanceTimersByTime(45_000);
    expect(sendPrivateTypingMock).toHaveBeenCalledTimes(2);

    stop();
    vi.advanceTimersByTime(45_000);
    expect(sendPrivateTypingMock).toHaveBeenCalledTimes(2);
  });

  it("keeps typing loop disabled for QQ groups and channels", async () => {
    const sender = await import("./message-sender.js");

    sender.startTypingLoop("group:group-1", "reply-1");
    sender.startTypingLoop("channel:channel-1", "reply-1");

    vi.advanceTimersByTime(45_000);
    expect(sendPrivateTypingMock).not.toHaveBeenCalled();
  });
});
