import { describe, expect, it } from "vitest";
import { buildOverviewModel } from "./components/overview-model";
import type { RelayDeskStudio } from "./types";
function createStudio(overrides: Partial<RelayDeskStudio["snapshot"]> = {}): RelayDeskStudio {
  const workspace = {
    aiCommand: "codex",
    logDir: "",
    logLevel: "INFO",
    env: {},
    tools: {
      claude: { cliPath: "", workDir: "/tmp/claude", timeoutMs: 600000, proxy: "", env: {} },
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
  };
  return {
    currentView: "console",
    snapshot: {
      bootstrap: {
        brand: {
          name: "RelayDesk",
          line: "",
          apiBaseUrl: "http://127.0.0.1:44919",
        },
        workspace,
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
        probes: {
          telegram: {
            success: true,
            message: "ok",
            testedAt: "2026-03-27T12:00:00.000Z",
            stale: false,
          },
        },
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
            workDir: "/tmp/default-codex",
            updatedAt: 1711958400000,
            sessionIds: {
              codex: "sess-telegram-1",
            },
            history: [
              {
                role: "user",
                content: "hi",
                createdAt: 1711958400000,
              },
            ],
          },
        },
        activeChats: {
          telegram: "tg-chat",
        },
        },
        routes: [
          {
            channel: "telegram",
            enabled: true,
            aiCommand: "codex",
            defaultWorkDir: "/tmp/default-codex",
            activeChatId: "tg-chat",
            activeSessionId: "sess-telegram-1",
            continuityMode: "native",
            hasActiveOverride: false,
          },
        ],
        journal: {
          latestFile: null,
          excerpt: [],
        },
      },
      workspace,
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
      ...overrides,
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
      applyRawEditor: () => undefined,
      resetRawEditor: () => undefined,
    },
  };
}
describe("buildOverviewModel workdir semantics", () => {
  it("shows only the default workspace when no runtime override exists", () => {
    const model = buildOverviewModel(createStudio());
    expect(model.workdir).toEqual({
      defaultPath: "/tmp/default-codex",
      currentPath: undefined,
      overridden: false,
    });
    expect(model.sessionSummary).toEqual({
      entryLabel: "最近活跃入口",
      entryValue: "Telegram",
      agentValue: "codex",
      continuityLabel: "原生续接",
      sessionId: "sess-telegram-1",
      workspaceLabel: "默认工作区",
      workspacePath: "/tmp/default-codex",
      scopeDetail: "当前会话沿用默认工作区。",
    });
    expect(model.recentSessions[0]).toMatchObject({
      platformLabel: "Telegram",
      agentValue: "codex",
      continuityLabel: "原生续接",
      sessionId: "sess-telegram-1",
      isPrimary: true,
    });
  });

  it("surfaces the primary route current directory when it differs from the default workspace", () => {
    const model = buildOverviewModel(
      createStudio({
        bootstrap: {
          ...createStudio().snapshot.bootstrap!,
          sessions: {
            ...createStudio().snapshot.bootstrap!.sessions,
            sessions: {
              ...createStudio().snapshot.bootstrap!.sessions.sessions,
              "scope:qq:private%3A1:user-1:-": {
                workDir: "/tmp/qq",
                updatedAt: 1711958460000,
                sessionIds: {
                  codex: "sess-qq-1",
                },
                history: [
                  {
                    role: "user",
                    content: "hi",
                    createdAt: 1711958460000,
                  },
                ],
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
              activeWorkDir: "/tmp/runtime-telegram",
              activeSessionId: "sess-telegram-2",
              continuityMode: "native",
              hasActiveOverride: true,
            },
          ],
        },
      }),
    );
    expect(model.workdir).toEqual({
      defaultPath: "/tmp/default-codex",
      currentPath: "/tmp/runtime-telegram",
      overridden: true,
    });
    expect(model.sessionSummary).toEqual({
      entryLabel: "最近活跃入口",
      entryValue: "Telegram",
      agentValue: "codex",
      continuityLabel: "原生续接",
      sessionId: "sess-telegram-2",
      workspaceLabel: "会话工作区",
      workspacePath: "/tmp/runtime-telegram",
      scopeDetail: "当前会话目录已覆盖默认工作区。",
    });
    expect(model.recentSessions).toHaveLength(2);
    expect(model.recentSessions.map((session) => ({
      platformLabel: session.platformLabel,
      agentValue: session.agentValue,
      continuityLabel: session.continuityLabel,
      sessionId: session.sessionId,
      isPrimary: session.isPrimary,
    }))).toEqual([
      {
        platformLabel: "QQ",
        agentValue: "codex",
        continuityLabel: "原生续接",
        sessionId: "sess-qq-1",
        isPrimary: false,
      },
      {
        platformLabel: "Telegram",
        agentValue: "codex",
        continuityLabel: "原生续接",
        sessionId: "sess-telegram-2",
        isPrimary: true,
      },
    ]);
  });

  it("falls back to the default route summary when no active session is present", () => {
    const baseStudio = createStudio();
    const model = buildOverviewModel(
      createStudio({
        bootstrap: {
          ...baseStudio.snapshot.bootstrap!,
          sessions: {
            ...baseStudio.snapshot.bootstrap!.sessions,
            activeChats: {},
          },
          routes: [
            {
              channel: "telegram",
              enabled: true,
              aiCommand: "codex",
              defaultWorkDir: "/tmp/default-codex",
              continuityMode: "fresh",
              hasActiveOverride: false,
            },
          ],
        },
      }),
    );

    expect(model.sessionSummary).toEqual({
      entryLabel: "默认入口",
      entryValue: "Telegram",
      agentValue: "codex",
      continuityLabel: "全新上下文",
      sessionId: "未建立",
      workspaceLabel: "默认工作区",
      workspacePath: "/tmp/default-codex",
      scopeDetail: "当前没有活跃会话，新请求会使用默认工作区。",
    });
  });
  it("treats a healthy WeChat-only setup as ready-to-start before runtime launch", () => {
    const baseStudio = createStudio();
    const model = buildOverviewModel(
      createStudio({
        bootstrap: {
          ...baseStudio.snapshot.bootstrap!,
          runtime: { running: false, pid: null, phase: "stopped", startupError: null },
          health: {
            ...baseStudio.snapshot.bootstrap!.health,
            telegram: { configured: false, enabled: false, healthy: false, message: "" },
            wechat: {
              configured: true,
              enabled: true,
              healthy: true,
              message: "ilink/getupdates credentials are in place.",
            },
          },
        },
        workspace: {
          ...baseStudio.snapshot.workspace,
          platforms: {
            ...baseStudio.snapshot.workspace.platforms,
            telegram: { ...baseStudio.snapshot.workspace.platforms!.telegram, enabled: false, botToken: "" },
            wechat: { ...baseStudio.snapshot.workspace.platforms!.wechat, enabled: true, token: "wx-token", baseUrl: "https://ilink.example.com" },
          },
        },
        enabledCount: 1,
        healthyCount: 1,
      }),
    );
    expect(model.lead).toEqual({
      title: "待配置",
      detail: "补齐平台和 AI 配置后即可启动。",
      tone: "warning",
    });
    expect(model.channelStatus).toEqual({
      label: "入口配置",
      value: "1 条就绪",
      tone: "success",
    });
  });
  it("shows a ready lead while the service is running with healthy WeChat", () => {
    const baseStudio = createStudio();
    const model = buildOverviewModel(
      createStudio({
        bootstrap: {
          ...baseStudio.snapshot.bootstrap!,
          health: {
            ...baseStudio.snapshot.bootstrap!.health,
            telegram: { configured: false, enabled: false, healthy: false, message: "" },
            wechat: {
              configured: true,
              enabled: true,
              healthy: true,
              message: "ilink/getupdates credentials are in place.",
            },
          },
        },
        workspace: {
          ...baseStudio.snapshot.workspace,
          platforms: {
            ...baseStudio.snapshot.workspace.platforms,
            telegram: { ...baseStudio.snapshot.workspace.platforms!.telegram, enabled: false, botToken: "" },
            wechat: { ...baseStudio.snapshot.workspace.platforms!.wechat, enabled: true, token: "wx-token", baseUrl: "https://ilink.example.com" },
          },
        },
        enabledCount: 1,
        healthyCount: 1,
      }),
    );
    expect(model.lead).toEqual({
      title: "运行中 · 待处理",
      detail: "连接或工具仍有未完成项。",
      tone: "warning",
    });
  });
  it("keeps ready channels visible in the overview summary without pending-runtime buckets", () => {
    const baseStudio = createStudio();
    const model = buildOverviewModel(
      createStudio({
        bootstrap: {
          ...baseStudio.snapshot.bootstrap!,
          health: {
            ...baseStudio.snapshot.bootstrap!.health,
            wechat: {
              configured: true,
              enabled: true,
              healthy: true,
              message: "ilink/getupdates credentials are in place.",
            },
          },
        },
        workspace: {
          ...baseStudio.snapshot.workspace,
          platforms: {
            ...baseStudio.snapshot.workspace.platforms,
            wechat: { ...baseStudio.snapshot.workspace.platforms!.wechat, enabled: true, token: "wx-token", baseUrl: "https://ilink.example.com" },
          },
        },
        enabledCount: 2,
        healthyCount: 2,
      }),
    );
    expect(model.channelStatus).toEqual({
      label: "渠道状态",
      value: "2 条就绪",
      tone: "success",
    });
  });
  it("shows enabled but unhealthy channels as pending fixes instead of hiding them as unconfigured", () => {
    const baseStudio = createStudio();
    const model = buildOverviewModel(
      createStudio({
        bootstrap: {
          ...baseStudio.snapshot.bootstrap!,
          health: {
            ...baseStudio.snapshot.bootstrap!.health,
            telegram: {
              configured: false,
              enabled: true,
              healthy: false,
              message: "Bot token is required.",
            },
          },
        },
        enabledCount: 1,
        healthyCount: 0,
      }),
    );
    expect(model.channelStatus).toEqual({
      label: "渠道状态",
      value: "1 条待修复",
      tone: "warning",
    });
  });

  it("surfaces startup-in-progress state in the overview model", () => {
    const baseStudio = createStudio();
    const model = buildOverviewModel(
      createStudio({
        bootstrap: {
          ...baseStudio.snapshot.bootstrap!,
          runtime: { running: false, pid: 4321, phase: "starting", startupError: null },
        },
      }),
    );

    expect(model.running).toBe(false);
    expect(model.starting).toBe(true);
    expect(model.lead).toEqual({
      title: "启动中",
      detail: "后台服务正在初始化渠道与会话。",
      tone: "warning",
    });
    expect(model.channelStatus).toEqual({
      label: "渠道启动",
      value: "1 条就绪",
      tone: "success",
    });
  });

  it("summarizes raw journal lines into concise overview log entries", () => {
    const model = buildOverviewModel(
      createStudio({
        bootstrap: {
          ...createStudio().snapshot.bootstrap!,
          journal: {
            latestFile: "2026-03-31.log",
            excerpt: [
              "2026-03-31 16:58:57 [INFO] [QQ] QQ gateway READY, session=abc",
              "2026-03-31 17:01:46 [INFO] [QQHandler] QQ message handled: user=u1, chat=private:u1, status=running, attachments=0",
              "2026-03-31 17:05:12 [INFO] [Queue] Queued task for scope:qq:u1:conv-1",
            ],
          },
        },
      }),
    );

    expect(model.log.file).toBe("2026-03-31.log");
    expect(model.log.lines).toEqual([
      { time: "16:58:57", detail: "QQ 已连接", tone: "success" },
      { time: "17:01:46", detail: "收到 QQ 消息", tone: "neutral" },
      { time: "17:05:12", detail: "当前会话进入排队", tone: "warning" },
    ]);
  });

  it("normalizes additional runtime lifecycle lines into concise Chinese summaries", () => {
    const model = buildOverviewModel(
      createStudio({
        bootstrap: {
          ...createStudio().snapshot.bootstrap!,
          journal: {
            latestFile: "2026-04-01.log",
            excerpt: [
              "2026-04-01 15:10:00 [INFO] [QQ] QQ bot initialized",
              "2026-04-01 15:10:01 [INFO] [RelayWorker] RelayDesk runtime shutting down",
              "2026-04-01 15:10:02 [INFO] [WeChat] WeChat client stopped",
            ],
          },
        },
      }),
    );

    expect(model.log.lines).toEqual([
      { time: "15:10:00", detail: "QQ 客户端已初始化", tone: "neutral" },
      { time: "15:10:01", detail: "服务正在停止", tone: "warning" },
      { time: "15:10:02", detail: "微信客户端已停止", tone: "warning" },
    ]);
  });

  it("prefers live journal entries over bootstrap excerpts for overview logs", () => {
    const baseStudio = createStudio();
    const model = buildOverviewModel(
      createStudio({
        bootstrap: {
          ...baseStudio.snapshot.bootstrap!,
          journal: {
            latestFile: "2026-04-01.log",
            excerpt: [
              "2026-04-01 15:10:00 [INFO] [RelayWorker] RelayDesk runtime booting",
            ],
          },
        },
        journal: {
          latestFile: "2026-04-02.log",
          excerpt: [
            "2026-04-02 15:10:59 [INFO] [RelayWorker] RelayDesk runtime shutting down",
          ],
          entries: [
            {
              raw: "2026-04-02 15:10:59 [INFO] [RelayWorker] RelayDesk runtime shutting down",
              occurredAt: "2026-04-02 15:10:59",
              timeLabel: "15:10:59",
              level: "INFO",
              tag: "RelayWorker",
              title: "后台服务正在停止",
              detail: "正在关闭渠道连接并清理会话。",
              tone: "warning",
            },
          ],
        },
      }),
    );

    expect(model.log.file).toBe("2026-04-02.log");
    expect(model.log.lines).toEqual([
      { time: "15:10:59", detail: "服务正在停止", tone: "warning" },
    ]);
  });
});
