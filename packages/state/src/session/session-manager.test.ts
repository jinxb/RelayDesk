import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  existsSyncMock,
  mkdirSyncMock,
  readFileSyncMock,
  writeFileSyncMock,
  realpathMock,
} = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
  realpathMock: vi.fn(async (value: string) => value),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: existsSyncMock,
    mkdirSync: mkdirSyncMock,
    readFileSync: readFileSyncMock,
    writeFileSync: writeFileSyncMock,
  };
});

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return {
    ...actual,
    realpath: realpathMock,
  };
});

import { buildScopedSessionOwnerId } from "./scope-id.js";
import { SessionManager, resolveWorkDirInput } from "./session-manager.js";

describe("resolveWorkDirInput", () => {
  it("treats drive-prefixed shorthand as rooted on that drive", () => {
    expect(resolveWorkDirInput("C:\\projects\\foo", "c:projects/subdir")).toBe(
      "c:\\projects\\subdir",
    );
  });

  it("keeps explicit drive-absolute paths absolute", () => {
    expect(resolveWorkDirInput("C:\\projects\\foo", "c:/projects/subdir")).toBe(
      "c:\\projects\\subdir",
    );
  });

  it("resolves relative paths from the base directory", () => {
    const baseDir = resolve(process.cwd(), "test-base");
    expect(resolveWorkDirInput(baseDir, "subdir/nested")).toBe(
      join(baseDir, "subdir", "nested"),
    );
  });
});

describe("SessionManager scoped continuity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSyncMock.mockReturnValue(false);
    readFileSyncMock.mockImplementation(() => {
      throw new Error("missing");
    });
  });

  it("isolates workdir and conversation state by scoped session owner id", () => {
    const manager = new SessionManager("/tmp/default");
    const scopeA = buildScopedSessionOwnerId({
      platform: "telegram",
      chatId: "chat-a",
      userId: "user-1",
    });
    const scopeB = buildScopedSessionOwnerId({
      platform: "telegram",
      chatId: "chat-b",
      userId: "user-1",
    });

    manager.recordUserPrompt(scopeA, "先看 chat-a");
    manager.recordAssistantReply(scopeA, "chat-a 回答");
    const convA = manager.getConvId(scopeA);
    const convB = manager.getConvId(scopeB);

    expect(convA).not.toBe(convB);
    expect(manager.getConversationStatus(scopeA, "codex")).toMatchObject({
      continuityMode: "relay",
      historyTurns: 2,
    });
    expect(manager.getConversationStatus(scopeB, "codex")).toMatchObject({
      continuityMode: "fresh",
      historyTurns: 0,
    });
  });

  it("preserves recent history when native codex session is cleared", () => {
    const manager = new SessionManager("/tmp/default");
    const scopeId = buildScopedSessionOwnerId({
      platform: "wechat",
      chatId: "chat-1",
      userId: "user-1",
    });

    manager.recordUserPrompt(scopeId, "继续刚才的话题");
    manager.recordAssistantReply(scopeId, "这是上一轮答案");
    const convId = manager.getConvId(scopeId);
    manager.setSessionIdForConv(scopeId, convId, "codex", "sess-1");

    expect(manager.getConversationStatus(scopeId, "codex").continuityMode).toBe("native");

    manager.clearActiveToolSession(scopeId, "codex", "task_error");

    expect(manager.getConversationStatus(scopeId, "codex")).toMatchObject({
      continuityMode: "relay",
      historyTurns: 2,
      lastResetReason: "task_error",
    });
  });

  it("resolves route workdirs from scoped chat anchors", () => {
    const manager = new SessionManager("/tmp/default");
    const scopeId = buildScopedSessionOwnerId({
      platform: "telegram",
      chatId: "chat-1",
      userId: "user-1",
    });

    manager.recordUserPrompt(scopeId, "hello");
    expect(manager.getWorkDirForRoute("telegram", "chat-1", "user-1")).toBe("/tmp/default");
  });

  it("migrates a legacy raw-user session into the first scoped chat", () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify({
      "legacy-user": {
        workDir: "/tmp/legacy-workdir",
        activeConvId: "conv-legacy",
        totalTurns: 3,
        sessionIds: {
          claude: "claude-session-1",
        },
      },
    }));

    const manager = new SessionManager("/tmp/default");
    const scopeId = buildScopedSessionOwnerId({
      platform: "telegram",
      chatId: "chat-1",
      userId: "legacy-user",
    });

    expect(manager.getWorkDir(scopeId)).toBe("/tmp/legacy-workdir");
    expect(manager.getConversationStatus(scopeId, "claude")).toMatchObject({
      convId: "conv-legacy",
      sessionId: "claude-session-1",
      continuityMode: "native",
    });
  });

  it("archives the previous conversation when starting a new session", () => {
    const manager = new SessionManager("/tmp/default");
    const scopeId = buildScopedSessionOwnerId({
      platform: "telegram",
      chatId: "chat-1",
      userId: "user-1",
    });

    manager.recordUserPrompt(scopeId, "old prompt");
    manager.recordAssistantReply(scopeId, "old reply");
    const previousConvId = manager.getConvId(scopeId);

    expect(manager.newSession(scopeId)).toBe(true);

    const raw = JSON.parse(writeFileSyncMock.mock.calls.at(-1)?.[1] as string) as Record<string, {
      activeConvId?: string;
      threads?: Record<string, { history?: Array<{ content?: string }> }>;
    }>;
    expect(raw[scopeId]?.activeConvId).not.toBe(previousConvId);
    expect(raw[scopeId]?.threads?.[previousConvId]?.history).toHaveLength(2);
  });

  it("archives the previous conversation when changing workdir", async () => {
    const manager = new SessionManager("/tmp/default");
    const scopeId = buildScopedSessionOwnerId({
      platform: "telegram",
      chatId: "chat-1",
      userId: "user-1",
    });
    existsSyncMock.mockImplementation((value: string) => value === "/tmp/default");

    manager.recordUserPrompt(scopeId, "before cd");
    manager.recordAssistantReply(scopeId, "reply before cd");
    const previousConvId = manager.getConvId(scopeId);

    await expect(manager.setWorkDir(scopeId, "/tmp/default")).resolves.toBe("/tmp/default");

    const raw = JSON.parse(writeFileSyncMock.mock.calls.at(-1)?.[1] as string) as Record<string, {
      activeConvId?: string;
      threads?: Record<string, { workDir?: string; lastResetReason?: string }>;
    }>;
    expect(raw[scopeId]?.activeConvId).not.toBe(previousConvId);
    expect(raw[scopeId]?.threads?.[previousConvId]).toMatchObject({
      workDir: "/tmp/default",
      lastResetReason: "workdir_changed",
    });
  });
});
