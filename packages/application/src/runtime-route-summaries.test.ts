import { describe, expect, it } from "vitest";
import { buildScopedSessionOwnerId } from "../../state/src/index.js";
import { buildRuntimeRouteSummaries } from "./runtime-route-summaries.js";

describe("buildRuntimeRouteSummaries", () => {
  it("carries user-aware active route workdirs into route summaries", () => {
    const routes = buildRuntimeRouteSummaries({
      workspace: {
        aiCommand: "codex",
        tools: {
          codex: {
            workDir: "/tmp/default-codex",
          },
        },
        platforms: {
          telegram: {
            enabled: true,
            aiCommand: "codex",
          },
          feishu: {
            enabled: true,
            aiCommand: "claude",
          },
        },
      },
      sessions: {
        [buildScopedSessionOwnerId({
          platform: "telegram",
          chatId: "tg-chat",
          userId: "tg-user",
        })]: {
          workDir: "/tmp/tg-runtime",
          updatedAt: 123,
          sessionIds: {
            codex: "sess-codex-1",
          },
          history: [
            { role: "user", content: "hi", createdAt: 1 },
          ],
        },
      },
      activeChats: {
        telegram: {
          chatId: "tg-chat",
          userId: "tg-user",
          updatedAt: 123,
        },
      },
    });

    expect(routes.find((route) => route.channel === "telegram")).toEqual(
      expect.objectContaining({
        aiCommand: "codex",
        defaultWorkDir: "/tmp/default-codex",
        activeChatId: "tg-chat",
        activeUserId: "tg-user",
        activeWorkDir: "/tmp/tg-runtime",
        activeSessionId: "sess-codex-1",
        continuityMode: "native",
        hasActiveOverride: true,
      }),
    );
  });
});
