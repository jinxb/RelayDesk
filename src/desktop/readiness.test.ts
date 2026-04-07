import { describe, expect, it } from "vitest";
import { buildLaunchChecklist } from "./readiness";
import type { StudioSnapshot } from "./types";
import { normalizeWorkspace } from "./workspace";

function createSnapshot(overrides: Partial<StudioSnapshot> = {}): StudioSnapshot {
  const workspace = normalizeWorkspace({
    aiCommand: "claude",
  });

  return {
    bootstrap: {
      brand: {
        name: "RelayDesk",
        line: "",
        apiBaseUrl: "http://127.0.0.1:44919",
      },
      workspace,
      claudeEnv: {},
      runtime: { running: false, pid: null, phase: "stopped", startupError: null },
      health: {
        telegram: { configured: false, enabled: false, healthy: false, message: "" },
        feishu: { configured: false, enabled: false, healthy: false, message: "" },
        qq: { configured: false, enabled: false, healthy: false, message: "" },
        wechat: { configured: false, enabled: false, healthy: false, message: "" },
        wework: { configured: false, enabled: false, healthy: false, message: "" },
        dingtalk: { configured: false, enabled: false, healthy: false, message: "" },
      },
      probes: {},
      routes: [],
      diagnostics: {
        nodeVersion: process.version,
        platform: "darwin-arm64",
        configPath: "/tmp/config.json",
        appHome: "/tmp/relaydesk",
        logDir: "/tmp/logs",
        codexReady: false,
        codebuddyReady: false,
        claudeReady: true,
      },
      sessions: {
        sessionCount: 0,
        sessions: {},
        activeChats: {},
      },
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
    enabledCount: 0,
    healthyCount: 0,
    ...overrides,
  };
}

function chatEntry(snapshot: StudioSnapshot) {
  const item = buildLaunchChecklist(snapshot).find((entry) => entry.label === "聊天入口");
  expect(item).toBeDefined();
  return item!;
}

describe("desktop readiness", () => {
  it("shows startup-in-progress detail while the worker is still initializing", () => {
    const item = buildLaunchChecklist(createSnapshot({
      bootstrap: {
        ...createSnapshot().bootstrap!,
        runtime: {
          running: false,
          pid: 4321,
          phase: "starting",
          startupError: null,
        },
      },
    })).find((entry) => entry.label === "后台服务");

    expect(item).toEqual({
      label: "后台服务",
      detail: "后台服务正在启动，等待渠道与会话初始化完成。",
      level: "attention",
    });
  });

  it("shows all-ready summary when WeChat is the only healthy enabled channel", () => {
    const item = chatEntry(createSnapshot({
      bootstrap: {
        ...createSnapshot().bootstrap!,
        health: {
          ...createSnapshot().bootstrap!.health,
          wechat: {
            configured: true,
            enabled: true,
            healthy: true,
            message: "ilink/getupdates credentials are in place.",
          },
        },
      },
      enabledCount: 1,
      healthyCount: 1,
    }));

    expect(item.detail).toBe("全部 1 个启用渠道都已具备基础配置。");
    expect(item.level).toBe("ready");
  });

  it("shows partial readiness summary when one enabled channel is still unhealthy", () => {
    const item = chatEntry(createSnapshot({
      bootstrap: {
        ...createSnapshot().bootstrap!,
        health: {
          ...createSnapshot().bootstrap!.health,
          telegram: {
            configured: true,
            enabled: true,
            healthy: true,
            message: "",
          },
          wechat: {
            configured: true,
            enabled: true,
            healthy: false,
            message: "401 unauthorized",
          },
        },
      },
      enabledCount: 2,
      healthyCount: 1,
    }));

    expect(item.detail).toBe("1/2 个启用渠道已具备基础配置。");
    expect(item.level).toBe("attention");
  });

  it("preserves the original all-ready summary when no pending runtime channel exists", () => {
    const item = chatEntry(createSnapshot({
      bootstrap: {
        ...createSnapshot().bootstrap!,
        health: {
          ...createSnapshot().bootstrap!.health,
          telegram: {
            configured: true,
            enabled: true,
            healthy: true,
            message: "",
          },
        },
      },
      enabledCount: 1,
      healthyCount: 1,
    }));

    expect(item.detail).toBe("全部 1 个启用渠道都已具备基础配置。");
    expect(item.level).toBe("ready");
  });
});
