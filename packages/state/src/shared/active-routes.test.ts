import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  existsSyncMock,
  mkdirSyncMock,
  readFileSyncMock,
  writeFileMock,
  writeFileSyncMock,
} = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  writeFileMock: vi.fn(async () => undefined),
  writeFileSyncMock: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
  mkdirSync: mkdirSyncMock,
  readFileSync: readFileSyncMock,
  writeFileSync: writeFileSyncMock,
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(async () => undefined),
  writeFile: writeFileMock,
}));

describe("active route anchors", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    existsSyncMock.mockReturnValue(false);
  });

  afterEach(async () => {
    const module = await import("./active-chats.js");
    module.flushActiveChats();
  });

  it("normalizes legacy string active chats into anchor objects", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(
      JSON.stringify({
        telegram: "tg-chat",
      }),
    );

    const module = await import("./active-chats.js");
    module.loadActiveChats();

    expect(module.getActiveRouteAnchor("telegram")).toEqual({
      chatId: "tg-chat",
      updatedAt: 0,
    });
  });

  it("stores user-aware active route anchors", async () => {
    const module = await import("./active-chats.js");
    module.setActiveRouteAnchor("telegram", {
      chatId: "tg-chat",
      userId: "tg-user",
    });
    module.flushActiveChats();

    expect(writeFileSyncMock).toHaveBeenCalledWith(
      expect.stringContaining("active-chats.json"),
      expect.stringContaining("\"userId\": \"tg-user\""),
      "utf-8",
    );
  });

  it("stores user-aware DingTalk anchors when active targets are updated", async () => {
    const module = await import("./active-chats.js");
    module.setDingTalkActiveTarget({
      chatId: "dt-chat",
      userId: "dt-user",
      conversationType: "1",
      robotCode: "robot-1",
    });
    module.flushActiveChats();

    expect(writeFileSyncMock).toHaveBeenCalledWith(
      expect.stringContaining("active-chats.json"),
      expect.stringContaining("\"userId\": \"dt-user\""),
      "utf-8",
    );
  });
});
