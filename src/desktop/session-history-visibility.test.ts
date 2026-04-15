import { describe, expect, it } from "vitest";
import { buildOverviewModel } from "./components/overview-model";
import { buildSessionManagementEntries } from "./components/session-management-model";
import type { RelayDeskStudio } from "./types";

function createStudio(): RelayDeskStudio {
  return {
    currentView: "console",
    snapshot: {
      bootstrap: {
        brand: {
          name: "RelayDesk",
          line: "",
          apiBaseUrl: "http://127.0.0.1:44919",
        },
        workspace: {
          aiCommand: "codex",
          logDir: "",
          logLevel: "INFO",
          env: {},
          tools: {
            claude: { workDir: "/tmp/claude", timeoutMs: 600000, env: {} },
            codex: { cliPath: "codex", workDir: "/tmp/default-codex", timeoutMs: 600000, proxy: "" },
            codebuddy: { cliPath: "codebuddy", timeoutMs: 600000 },
          },
          platforms: {
            telegram: { enabled: true, aiCommand: "codex", botToken: "token", proxy: "", allowedUserIds: [] },
            feishu: { enabled: false, appId: "", appSecret: "", allowedUserIds: [] },
            qq: { enabled: false, appId: "", secret: "", allowedUserIds: [] },
            wechat: { enabled: false, token: "", baseUrl: "", allowedUserIds: [] },
            wework: { enabled: false, corpId: "", secret: "", wsUrl: "", allowedUserIds: [] },
            dingtalk: { enabled: false, clientId: "", clientSecret: "", cardTemplateId: "", allowedUserIds: [] },
          },
        },
        claudeEnv: {},
        runtime: { running: true, pid: 1001, phase: "running", startupError: null },
        health: {
          telegram: { configured: true, enabled: true, healthy: true, message: "" },
          feishu: { configured: false, enabled: false, healthy: false, message: "" },
          qq: { configured: false, enabled: false, healthy: false, message: "" },
          wechat: { configured: false, enabled: false, healthy: false, message: "" },
          wework: { configured: false, enabled: false, healthy: false, message: "" },
          dingtalk: { configured: false, enabled: false, healthy: false, message: "" },
        },
        probes: {},
        diagnostics: {
          nodeVersion: "v22",
          platform: "darwin-arm64",
          configPath: "/tmp/config.json",
          appHome: "/tmp/relaydesk",
          logDir: "/tmp/logs",
          codexReady: true,
          codebuddyReady: true,
          claudeReady: true,
        },
        sessions: {
          sessionCount: 1,
          sessions: {
            "scope:telegram:tg-chat:tg-user:-": {
              workDir: "/tmp/runtime-current",
              activeConvId: "conv-current",
              updatedAt: 1711958520000,
              sessionIds: {
                codex: "sess-current",
              },
              history: [
                {
                  role: "user",
                  content: "new prompt",
                  createdAt: 1711958520000,
                },
              ],
              threads: {
                "conv-archived": {
                  workDir: "/tmp/runtime-before-cd",
                  updatedAt: 1711958460000,
                  lastResetReason: "workdir_changed",
                  sessionIds: {
                    codex: "sess-archived",
                  },
                  history: [
                    {
                      role: "user",
                      content: "old prompt",
                      createdAt: 1711958460000,
                    },
                    {
                      role: "assistant",
                      content: "old reply",
                      createdAt: 1711958461000,
                    },
                  ],
                },
              },
            },
          },
          activeChats: {
            telegram: {
              chatId: "tg-chat",
              userId: "tg-user",
            },
          },
        },
        routes: [
          {
            channel: "telegram",
            enabled: true,
            aiCommand: "codex",
            defaultWorkDir: "/tmp/default-codex",
            activeChatId: "tg-chat",
            activeUserId: "tg-user",
            activeWorkDir: "/tmp/runtime-current",
            activeSessionId: "sess-current",
            continuityMode: "native",
            hasActiveOverride: true,
          },
        ],
        journal: {
          latestFile: null,
          excerpt: [],
        },
      },
      workspace: {
        aiCommand: "codex",
        logDir: "",
        logLevel: "INFO",
        env: {},
        tools: {
          claude: { workDir: "/tmp/claude", timeoutMs: 600000, env: {} },
          codex: { cliPath: "codex", workDir: "/tmp/default-codex", timeoutMs: 600000, proxy: "" },
          codebuddy: { cliPath: "codebuddy", timeoutMs: 600000 },
        },
        platforms: {
          telegram: { enabled: true, aiCommand: "codex", botToken: "token", proxy: "", allowedUserIds: [] },
          feishu: { enabled: false, appId: "", appSecret: "", allowedUserIds: [] },
          qq: { enabled: false, appId: "", secret: "", allowedUserIds: [] },
          wechat: { enabled: false, token: "", baseUrl: "", allowedUserIds: [] },
          wework: { enabled: false, corpId: "", secret: "", wsUrl: "", allowedUserIds: [] },
          dingtalk: { enabled: false, clientId: "", clientSecret: "", cardTemplateId: "", allowedUserIds: [] },
        },
      },
      claudeEnvEditor: "{}",
      rawEditor: "{}",
      probeResults: {},
      shellIdentity: null,
      sidecar: null,
      desktopSupported: true,
      isFirstTime: false,
      loading: false,
      busy: false,
      busyMessage: null,
      dirty: false,
      rawDraft: false,
      status: { message: "", tone: "neutral" },
      enabledCount: 1,
      healthyCount: 1,
      journal: null,
    },
    actions: {
      setCurrentView: () => undefined,
      updateWorkspace: () => undefined,
      setClaudeEnvEditor: () => undefined,
      setRawEditor: () => undefined,
      refresh: async () => undefined,
      saveWorkspace: async () => undefined,
      validateWorkspace: async () => undefined,
      startRuntime: async () => undefined,
      stopRuntime: async () => undefined,
      startSidecar: async () => undefined,
      stopSidecar: async () => undefined,
      probeChannel: async () => undefined,
      openPath: async () => undefined,
      revealPath: async () => undefined,
      hideWindow: async () => undefined,
      pickClaudeWorkTree: async () => undefined,
      pickDefaultWorkTree: async () => undefined,
      applyRawEditor: () => undefined,
      resetRawEditor: () => undefined,
    },
  };
}

describe("session history visibility", () => {
  it("keeps archived conversations visible in session management after /cd or /new", () => {
    const entries = buildSessionManagementEntries(createStudio());

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      activeConvId: "conv-current",
      isPrimary: true,
      sessionId: "sess-current",
      workDir: "/tmp/runtime-current",
    });
    expect(entries[1]).toMatchObject({
      activeConvId: "conv-archived",
      isPrimary: false,
      lastResetReasonLabel: "工作目录变更",
      sessionId: "sess-archived",
      turnCount: 2,
      workDir: "/tmp/runtime-before-cd",
    });
    expect(entries[1]?.turns.map((turn) => turn.content)).toEqual(["old prompt", "old reply"]);
  });

  it("includes archived conversations in overview recent sessions", () => {
    const model = buildOverviewModel(createStudio());

    expect(model.recentSessions).toHaveLength(2);
    expect(model.recentSessions[0]).toMatchObject({
      isPrimary: true,
      sessionId: "sess-current",
    });
    expect(model.recentSessions[1]).toMatchObject({
      isPrimary: false,
      sessionId: "sess-archived",
      continuityLabel: "原生续接",
    });
  });
});
