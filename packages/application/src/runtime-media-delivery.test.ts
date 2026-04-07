import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getDingTalkActiveTargetMock,
  sendDingTalkFileReplyMock,
  sendDingTalkImageReplyMock,
  sendFeishuFileReplyMock,
  sendFeishuImageReplyMock,
  sendQQFileReplyMock,
  sendQQImageReplyMock,
  sendTelegramFileReplyMock,
  sendTelegramImageReplyMock,
  sendWeChatFileReplyMock,
  sendWeChatImageReplyMock,
} = vi.hoisted(() => ({
  getDingTalkActiveTargetMock: vi.fn(),
  sendDingTalkFileReplyMock: vi.fn(async () => {}),
  sendDingTalkImageReplyMock: vi.fn(async () => {}),
  sendFeishuFileReplyMock: vi.fn(async () => {}),
  sendFeishuImageReplyMock: vi.fn(async () => {}),
  sendQQFileReplyMock: vi.fn(async () => {}),
  sendQQImageReplyMock: vi.fn(async () => {}),
  sendTelegramFileReplyMock: vi.fn(async () => {}),
  sendTelegramImageReplyMock: vi.fn(async () => {}),
  sendWeChatFileReplyMock: vi.fn(async () => {}),
  sendWeChatImageReplyMock: vi.fn(async () => {}),
}));

vi.mock("../../state/src/index.js", async () => {
  const actual = await vi.importActual<typeof import("../../state/src/index.js")>("../../state/src/index.js");
  return {
    ...actual,
    getDingTalkActiveTarget: getDingTalkActiveTargetMock,
  };
});

vi.mock("../../channels/src/telegram/message-sender.js", () => ({
  sendImageReply: sendTelegramImageReplyMock,
  sendFileReply: sendTelegramFileReplyMock,
}));

vi.mock("../../channels/src/feishu/message-sender.js", () => ({
  sendImageReply: sendFeishuImageReplyMock,
  sendFileReply: sendFeishuFileReplyMock,
}));

vi.mock("../../channels/src/qq/message-sender.js", () => ({
  sendImageReply: sendQQImageReplyMock,
  sendFileReply: sendQQFileReplyMock,
}));

vi.mock("../../channels/src/wechat/message-sender.js", () => ({
  sendImageReply: sendWeChatImageReplyMock,
  sendFileReply: sendWeChatFileReplyMock,
}));

vi.mock("../../channels/src/dingtalk/message-sender.js", () => ({
  sendImageReply: sendDingTalkImageReplyMock,
  sendFileReply: sendDingTalkFileReplyMock,
}));

import { deliverMediaToCurrentTaskTarget } from "./runtime-media-delivery.js";

const TEMP_DIRS: string[] = [];

function createTempFile(name: string) {
  const dir = mkdtempSync(join(tmpdir(), "relaydesk-media-delivery-"));
  TEMP_DIRS.push(dir);
  const filePath = join(dir, name);
  writeFileSync(filePath, "payload", "utf-8");
  return filePath;
}

afterEach(() => {
  while (TEMP_DIRS.length > 0) {
    rmSync(TEMP_DIRS.pop()!, { recursive: true, force: true });
  }
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deliverMediaToCurrentTaskTarget", () => {
  it("delivers Telegram images through the native sender", async () => {
    const imagePath = createTempFile("reply.png");

    await expect(
      deliverMediaToCurrentTaskTarget(
        { taskKey: "task-1", platform: "telegram", chatId: "123" },
        { kind: "image", filePath: imagePath },
      ),
    ).resolves.toMatchObject({
      ok: true,
      channel: "telegram",
      kind: "image",
    });

    expect(sendTelegramImageReplyMock).toHaveBeenCalledWith("123", imagePath);
  });

  it("rejects non-absolute file paths", async () => {
    await expect(
      deliverMediaToCurrentTaskTarget(
        { taskKey: "task-2", platform: "telegram", chatId: "123" },
        { kind: "file", filePath: "relative/report.txt" },
      ),
    ).rejects.toThrow("filePath 必须是本地绝对路径");
  });

  it("rejects QQ channel media delivery when the chat target has no native media path", async () => {
    const imagePath = createTempFile("reply.png");

    await expect(
      deliverMediaToCurrentTaskTarget(
        { taskKey: "task-3", platform: "qq", chatId: "channel:abc" },
        { kind: "image", filePath: imagePath },
      ),
    ).rejects.toThrow("QQ 频道当前不支持原生图片回传");
  });

  it("resolves DingTalk active targets before sending native files", async () => {
    const filePath = createTempFile("report.txt");
    getDingTalkActiveTargetMock.mockReturnValue({
      chatId: "dt-chat",
      userId: "staff-1",
      conversationType: "1",
      robotCode: "robot-1",
      updatedAt: Date.now(),
    });

    await deliverMediaToCurrentTaskTarget(
      { taskKey: "task-4", platform: "dingtalk", chatId: "dt-chat" },
      { kind: "file", filePath },
    );

    expect(sendDingTalkFileReplyMock).toHaveBeenCalledWith(
      "dt-chat",
      filePath,
      expect.objectContaining({
        chatId: "dt-chat",
        senderStaffId: "staff-1",
        robotCode: "robot-1",
      }),
    );
  });
});
