import { beforeEach, describe, expect, it, vi } from "vitest";

const sendWeChatMessageItemsMock = vi.fn(async () => {});
const uploadWeChatImageFileMock = vi.fn(async () => ({
  encryptedQueryParam: "enc-1",
  aesKeyBase64: "aes-1",
  fileSize: 12,
  ciphertextSize: 16,
}));
const uploadWeChatVideoFileMock = vi.fn(async () => ({
  encryptedQueryParam: "enc-2",
  aesKeyBase64: "aes-2",
  fileSize: 20,
  ciphertextSize: 32,
}));
const uploadWeChatAttachmentFileMock = vi.fn(async () => ({
  encryptedQueryParam: "enc-3",
  aesKeyBase64: "aes-3",
  fileSize: 42,
  ciphertextSize: 48,
}));

vi.mock("./api.js", async () => {
  const actual = await vi.importActual<typeof import("./api.js")>("./api.js");
  return {
    ...actual,
    sendWeChatMessageItems: sendWeChatMessageItemsMock,
  };
});

vi.mock("./upload.js", () => ({
  uploadWeChatImageFile: uploadWeChatImageFileMock,
  uploadWeChatVideoFile: uploadWeChatVideoFileMock,
  uploadWeChatAttachmentFile: uploadWeChatAttachmentFileMock,
}));

describe("WeChat send-media helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes image files through the WeChat image upload path", async () => {
    const media = await import("./send-media.js");

    await media.sendWeChatNativeMediaFile({
      baseUrl: "https://ilink.example.com",
      token: "wx-token",
      toUserId: "wx-user-1",
      clientId: "client-1",
      contextToken: "ctx-1",
      filePath: "/tmp/out.png",
    });

    expect(uploadWeChatImageFileMock).toHaveBeenCalled();
    expect(sendWeChatMessageItemsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toUserId: "wx-user-1",
        clientId: "client-1",
      }),
    );
    expect(sendWeChatMessageItemsMock.mock.calls[0]?.[0]?.items?.[0]?.type).toBe(2);
  });

  it("routes video files through the WeChat video upload path", async () => {
    const media = await import("./send-media.js");

    await media.sendWeChatNativeMediaFile({
      baseUrl: "https://ilink.example.com",
      token: "wx-token",
      toUserId: "wx-user-1",
      clientId: "client-1",
      contextToken: "ctx-1",
      filePath: "/tmp/out.mp4",
    });

    expect(uploadWeChatVideoFileMock).toHaveBeenCalled();
    expect(sendWeChatMessageItemsMock.mock.calls[0]?.[0]?.items?.[0]?.type).toBe(5);
  });

  it("routes generic files through the WeChat attachment upload path", async () => {
    const media = await import("./send-media.js");

    await media.sendWeChatNativeMediaFile({
      baseUrl: "https://ilink.example.com",
      token: "wx-token",
      toUserId: "wx-user-1",
      clientId: "client-1",
      contextToken: "ctx-1",
      filePath: "/tmp/report.pdf",
    });

    expect(uploadWeChatAttachmentFileMock).toHaveBeenCalled();
    expect(sendWeChatMessageItemsMock.mock.calls[0]?.[0]?.items?.[0]?.type).toBe(4);
  });

  it("keeps native voice unsupported until a real route exists", async () => {
    const media = await import("./send-media.js");

    await expect(
      media.sendWeChatNativeMediaFile({
        baseUrl: "https://ilink.example.com",
        token: "wx-token",
        toUserId: "wx-user-1",
        clientId: "client-1",
        contextToken: "ctx-1",
        filePath: "/tmp/reply.mp3",
      }),
    ).rejects.toThrow("native voice send is not implemented");
    expect(sendWeChatMessageItemsMock).not.toHaveBeenCalled();
  });
});
