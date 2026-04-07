import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createReadStreamMock,
  editMessageTextMock,
  editMessageReplyMarkupMock,
  sendDocumentMock,
  sendMessageMock,
  sendPhotoMock,
  sendVideoMock,
  sendVoiceMock,
} = vi.hoisted(() => ({
  createReadStreamMock: vi.fn((path: string) => ({ path })),
  editMessageTextMock: vi.fn(async () => {}),
  editMessageReplyMarkupMock: vi.fn(async () => {}),
  sendDocumentMock: vi.fn(async () => ({ message_id: 12 })),
  sendMessageMock: vi.fn(async () => ({ message_id: 11 })),
  sendPhotoMock: vi.fn(async () => ({ message_id: 15 })),
  sendVideoMock: vi.fn(async () => ({ message_id: 13 })),
  sendVoiceMock: vi.fn(async () => ({ message_id: 14 })),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    createReadStream: createReadStreamMock,
  };
});

vi.mock("./client.js", () => ({
  getBot: () => ({
    telegram: {
      editMessageReplyMarkup: editMessageReplyMarkupMock,
      editMessageText: editMessageTextMock,
      sendDocument: sendDocumentMock,
      sendMessage: sendMessageMock,
      sendPhoto: sendPhotoMock,
      sendVideo: sendVideoMock,
      sendVoice: sendVoiceMock,
    },
  }),
}));

import { sendFileReply, sendImageReply, sendThinkingMessage, updateMessage } from "./message-sender.js";

describe("Telegram message sender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears the stop button when a message finishes", async () => {
    await updateMessage("100", "101", "最终结果", "done", "耗时 1.2s", "codex", true);

    expect(editMessageTextMock).toHaveBeenCalledWith(
      100,
      101,
      undefined,
      expect.not.stringContaining("Codex - 完成"),
      expect.objectContaining({
        reply_markup: {
          inline_keyboard: [],
        },
      }),
    );
    expect(editMessageTextMock.mock.calls[0]?.[3]).toContain("最终结果");
    expect(editMessageTextMock.mock.calls[0]?.[3]).toContain("Codex · 耗时 1.2s");
  });

  it("keeps the stop button while streaming", async () => {
    await sendThinkingMessage("100", undefined, "codex");

    expect(editMessageReplyMarkupMock).toHaveBeenCalledWith(
      100,
      11,
      undefined,
      {
        inline_keyboard: [[{ text: "⏹️ 停止", callback_data: "stop_11" }]],
      },
    );
  });

  it("propagates real Telegram edit failures", async () => {
    editMessageTextMock.mockRejectedValue(new Error("message can't be edited"));

    await expect(
      updateMessage("100", "101", "最终结果", "done", "耗时 1.2s", "codex"),
    ).rejects.toThrow("message can't be edited");
  });

  it("sends generated documents through Telegram sendDocument", async () => {
    await sendFileReply("100", "/tmp/report.txt");

    expect(sendDocumentMock).toHaveBeenCalledWith(100, {
      source: { path: "/tmp/report.txt" },
      filename: "report.txt",
    });
  });

  it("sends generated images through Telegram sendPhoto", async () => {
    await sendImageReply("100", "/tmp/reply.png");

    expect(sendPhotoMock).toHaveBeenCalledWith(100, {
      source: { path: "/tmp/reply.png" },
    });
  });

  it("sends generated voice files through Telegram sendVoice", async () => {
    await sendFileReply("100", "C:\\audio\\reply.mp3");

    expect(sendVoiceMock).toHaveBeenCalledWith(
      100,
      { source: { path: "C:\\audio\\reply.mp3" } },
      { caption: "reply.mp3" },
    );
  });

  it("sends generated video files through Telegram sendVideo", async () => {
    await sendFileReply("100", "/tmp/reply.mp4");

    expect(sendVideoMock).toHaveBeenCalledWith(
      100,
      { source: { path: "/tmp/reply.mp4" } },
      { caption: "reply.mp4" },
    );
  });
});
