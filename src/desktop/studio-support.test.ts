import { describe, expect, it } from "vitest";
import type { BootstrapPayload } from "../lib/models";
import { shouldShowSetupWizard } from "./studio-support";

function createBootstrapPayload(overrides: Partial<BootstrapPayload> = {}): BootstrapPayload {
  return {
    brand: {
      name: "RelayDesk",
      line: "Trusted messaging orchestration for local coding agents.",
      apiBaseUrl: "http://127.0.0.1:44919",
    },
    workspace: {
      aiCommand: "claude",
      env: {},
      logDir: "",
      logLevel: "INFO",
      tools: {
        claude: { cliPath: "", workDir: "", timeoutMs: 600000, proxy: "", env: {} },
        codex: { cliPath: "codex", workDir: "", timeoutMs: 1800000, idleTimeoutMs: 600000, proxy: "" },
        codebuddy: { cliPath: "codebuddy", timeoutMs: 600000, idleTimeoutMs: 600000 },
      },
      platforms: {
        telegram: { enabled: false, botToken: "", proxy: "", allowedUserIds: [] },
        feishu: { enabled: false, appId: "", appSecret: "", allowedUserIds: [] },
        qq: { enabled: false, appId: "", secret: "", allowedUserIds: [] },
        wework: { enabled: false, corpId: "", secret: "", wsUrl: "", allowedUserIds: [] },
        dingtalk: { enabled: false, clientId: "", clientSecret: "", cardTemplateId: "", allowedUserIds: [] },
        wechat: { enabled: false, token: "", baseUrl: "", allowedUserIds: [] },
      },
    },
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
    diagnostics: {
      nodeVersion: process.version,
      platform: "darwin-arm64",
      configPath: "/tmp/config.json",
      appHome: "/tmp/relaydesk",
      logDir: "/tmp/logs",
      codexReady: false,
      codebuddyReady: false,
      claudeReady: false,
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
    ...overrides,
  };
}

describe("shouldShowSetupWizard", () => {
  it("shows the setup wizard for an empty bootstrap payload", () => {
    expect(shouldShowSetupWizard(createBootstrapPayload())).toBe(true);
  });

  it("keeps the regular workspace visible when a partial config already exists", () => {
    const payload = createBootstrapPayload({
      workspace: {
        ...createBootstrapPayload().workspace,
        platforms: {
          ...createBootstrapPayload().workspace.platforms,
          telegram: {
            enabled: true,
            botToken: "partial-token",
            proxy: "",
            allowedUserIds: [],
          },
        },
      },
    });

    expect(shouldShowSetupWizard(payload)).toBe(false);
  });

  it("keeps the regular workspace visible when a channel is configured via runtime env", () => {
    const payload = createBootstrapPayload({
      health: {
        ...createBootstrapPayload().health,
        telegram: {
          configured: true,
          enabled: true,
          healthy: true,
          message: "Access token is present.",
        },
      },
    });

    expect(shouldShowSetupWizard(payload)).toBe(false);
  });
});
