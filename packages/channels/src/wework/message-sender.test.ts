import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const sendTextMock = vi.fn();
const sendStreamMock = vi.fn();
const sendStreamWithItemsMock = vi.fn();
const sendProactiveMessageMock = vi.fn();
const sendWebSocketReplyMock = vi.fn();
const uploadWeWorkMediaMock = vi.fn();
const tempDirs: string[] = [];

vi.mock("./client.js", () => ({
  sendText: sendTextMock,
  sendStream: sendStreamMock,
  sendStreamWithItems: sendStreamWithItemsMock,
  sendProactiveMessage: sendProactiveMessageMock,
  sendWebSocketReply: sendWebSocketReplyMock,
  uploadWeWorkMedia: uploadWeWorkMediaMock,
}));

describe("WeWork message sender", () => {
  beforeEach(() => {
    vi.resetModules();
    sendTextMock.mockReset();
    sendStreamMock.mockReset();
    sendStreamWithItemsMock.mockReset();
    sendProactiveMessageMock.mockReset();
    sendWebSocketReplyMock.mockReset();
    uploadWeWorkMediaMock.mockReset();
    uploadWeWorkMediaMock.mockResolvedValue({ mediaId: "media-file-1" });
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("formats bash notes as a code block in streaming updates", async () => {
    const sender = await import("./message-sender.js");

    await sender.updateMessage(
      "chat-1",
      "stream-1",
      "正文",
      "streaming",
      '输出中...\n🔧 Bash → "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"',
      "codex",
      "req-1",
    );

    expect(sendStreamMock).toHaveBeenCalledTimes(1);
    expect(sendStreamMock).toHaveBeenCalledWith(
      "req-1",
      "stream-1",
      expect.stringContaining("🔧 Bash\n```"),
      false,
    );
    expect(sendStreamMock.mock.calls[0][2]).toContain(
      '"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"',
    );
  });

  it("renders note content below the divider instead of inline with it", async () => {
    const sender = await import("./message-sender.js");

    await sender.updateMessage(
      "chat-1",
      "stream-1",
      "正文",
      "streaming",
      "输出中...\nRead src/wework/message-sender.ts",
      "codex",
      "req-1",
    );

    expect(sendStreamMock).toHaveBeenCalledTimes(1);
    expect(sendStreamMock.mock.calls[0][2]).toContain("─────────\n\n");
  });

  it("uses the explicit req_id when sending generated images", async () => {
    const sender = await import("./message-sender.js");
    const dir = mkdtempSync(join(tmpdir(), "relaydesk-wework-image-"));
    tempDirs.push(dir);
    const imagePath = join(dir, "out.png");
    writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    await sender.sendImageReply("chat-1", imagePath, "req-explicit");

    expect(sendStreamWithItemsMock).toHaveBeenCalledTimes(1);
    expect(sendStreamWithItemsMock.mock.calls[0][0]).toBe("req-explicit");
  });

  it("uploads and replies with native WeWork files when req_id is available", async () => {
    const sender = await import("./message-sender.js");
    const dir = mkdtempSync(join(tmpdir(), "relaydesk-wework-file-"));
    tempDirs.push(dir);
    const filePath = join(dir, "report.txt");
    writeFileSync(filePath, "hello file");

    await sender.sendFileReply("chat-1", filePath, "req-file");

    expect(uploadWeWorkMediaMock).toHaveBeenCalledWith(filePath, "file", "report.txt");
    expect(sendStreamMock).toHaveBeenNthCalledWith(1, "req-file", expect.any(String), "Generated file: report.txt", false);
    expect(sendWebSocketReplyMock).toHaveBeenCalledWith("req-file", {
      msgtype: "file",
      file: {
        media_id: "media-file-1",
      },
    });
    expect(sendStreamMock).toHaveBeenNthCalledWith(2, "req-file", expect.any(String), "Generated file: report.txt", true);
  });

  it("uploads and replies with native WeWork voice when req_id is available", async () => {
    uploadWeWorkMediaMock.mockResolvedValueOnce({ mediaId: "media-voice-1" });

    const sender = await import("./message-sender.js");
    const dir = mkdtempSync(join(tmpdir(), "relaydesk-wework-voice-"));
    tempDirs.push(dir);
    const filePath = join(dir, "reply.mp3");
    writeFileSync(filePath, "hello voice");

    await sender.sendFileReply("chat-1", filePath, "req-voice");

    expect(uploadWeWorkMediaMock).toHaveBeenCalledWith(filePath, "voice", "reply.mp3");
    expect(sendWebSocketReplyMock).toHaveBeenCalledWith("req-voice", {
      msgtype: "voice",
      voice: {
        media_id: "media-voice-1",
      },
    });
    expect(sendStreamMock).toHaveBeenNthCalledWith(1, "req-voice", expect.any(String), "Generated voice: reply.mp3", false);
    expect(sendStreamMock).toHaveBeenNthCalledWith(2, "req-voice", expect.any(String), "Generated voice: reply.mp3", true);
  });

  it("uploads and replies with native WeWork video when req_id is available", async () => {
    uploadWeWorkMediaMock.mockResolvedValueOnce({ mediaId: "media-video-1" });

    const sender = await import("./message-sender.js");
    const dir = mkdtempSync(join(tmpdir(), "relaydesk-wework-video-"));
    tempDirs.push(dir);
    const filePath = join(dir, "reply.mp4");
    writeFileSync(filePath, "hello video");

    await sender.sendFileReply("chat-1", filePath, "req-video");

    expect(uploadWeWorkMediaMock).toHaveBeenCalledWith(filePath, "video", "reply.mp4");
    expect(sendWebSocketReplyMock).toHaveBeenCalledWith("req-video", {
      msgtype: "video",
      video: {
        media_id: "media-video-1",
      },
    });
    expect(sendStreamMock).toHaveBeenNthCalledWith(1, "req-video", expect.any(String), "Generated video: reply.mp4", false);
    expect(sendStreamMock).toHaveBeenNthCalledWith(2, "req-video", expect.any(String), "Generated video: reply.mp4", true);
  });

  it("falls back to text when native WeWork file reply has no req_id", async () => {
    const sender = await import("./message-sender.js");

    await sender.sendFileReply("chat-1", "/tmp/report.txt");

    expect(sendTextMock).toHaveBeenCalledTimes(1);
    expect(sendTextMock.mock.calls[0][1]).toContain("Generated file saved at: /tmp/report.txt");
  });

  it("falls back to text when native WeWork voice reply has no req_id", async () => {
    const sender = await import("./message-sender.js");

    await sender.sendFileReply("chat-1", "/tmp/reply.mp3");

    expect(sendTextMock).toHaveBeenCalledTimes(1);
    expect(sendTextMock.mock.calls[0][1]).toContain("Generated voice saved at: /tmp/reply.mp3");
  });

  it("closes the progress stream before falling back when native file upload fails", async () => {
    uploadWeWorkMediaMock.mockRejectedValueOnce(new Error("upload failed"));
    const sender = await import("./message-sender.js");

    await sender.sendFileReply("chat-1", "/tmp/report.txt", "req-file");

    expect(sendStreamMock).toHaveBeenNthCalledWith(1, "req-file", expect.any(String), "Generated file: report.txt", false);
    expect(sendStreamMock).toHaveBeenNthCalledWith(2, "req-file", expect.any(String), "Generated file: report.txt", true);
    expect(sendTextMock).toHaveBeenCalledTimes(1);
    expect(sendTextMock.mock.calls[0][1]).toContain("Generated file saved at: /tmp/report.txt");
  });
});
