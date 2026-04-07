import { describe, expect, it } from "vitest";
import { resolveRuntimeWorkTree, validateWorkspace, workspaceUsedAgents } from "./workspace.js";

describe("workspaceUsedAgents", () => {
  it("ignores AI overrides on disabled channels", () => {
    const agents = workspaceUsedAgents({
      aiCommand: "codex",
      tools: {
        codex: { cliPath: "codex" },
      },
      platforms: {
        telegram: {
          enabled: true,
          botToken: "token",
        },
        feishu: {
          enabled: false,
          aiCommand: "claude",
          appId: "id",
          appSecret: "secret",
        },
      },
    });

    expect(agents).toEqual(["codex"]);
  });
});

describe("validateWorkspace", () => {
  it("does not require Claude credentials when only disabled channels override Claude", () => {
    const result = validateWorkspace(
      {
        aiCommand: "codex",
        tools: {
          codex: { cliPath: "codex" },
        },
        platforms: {
          telegram: {
            enabled: true,
            botToken: "token",
          },
          feishu: {
            enabled: false,
            aiCommand: "claude",
            appId: "id",
            appSecret: "secret",
          },
        },
      },
      {},
    );

    expect(result.issues).not.toContain("Claude route selected without reachable credentials.");
  });

  it("rejects unsupported WeChat standard OAuth-only configuration", () => {
    const result = validateWorkspace(
      {
        aiCommand: "codex",
        tools: {
          codex: { cliPath: "codex" },
        },
        platforms: {
          wechat: {
            enabled: true,
            appId: "wx-app",
            appSecret: "wx-secret",
          },
        },
      },
      {},
    );

    expect(result.issues).toContain(
      "WeChat legacy AGP/OAuth fields are no longer supported. Configure token and baseUrl for the ilink/getupdates transport.",
    );
  });

  it("counts WeChat ilink credentials as an active runnable channel", () => {
    const result = validateWorkspace(
      {
        aiCommand: "codex",
        tools: {
          codex: { cliPath: "codex" },
        },
        platforms: {
          wechat: {
            enabled: true,
            token: "wx-token",
            baseUrl: "https://ilink.example.com",
          },
        },
      },
      {},
    );

    expect(result.ok).toBe(true);
    expect(result.requiredChannels).toEqual(["wechat"]);
    expect(result.issues).toEqual([]);
  });

  it("keeps WeChat and other runnable channels together in requiredChannels", () => {
    const result = validateWorkspace(
      {
        aiCommand: "codex",
        tools: {
          codex: { cliPath: "codex" },
        },
        platforms: {
          telegram: {
            enabled: true,
            botToken: "token",
          },
          wechat: {
            enabled: true,
            token: "wx-token",
            baseUrl: "https://ilink.example.com",
          },
        },
      },
      {},
    );

    expect(result.requiredChannels).toEqual(["telegram", "wechat"]);
    expect(result.issues).toEqual([]);
  });
});

describe("resolveRuntimeWorkTree", () => {
  it("prefers the selected default agent workdir", () => {
    const workTree = resolveRuntimeWorkTree({
      aiCommand: "codex",
      tools: {
        claude: { workDir: "/claude" },
        codex: { workDir: "/codex" },
      },
    });

    expect(workTree).toBe("/codex");
  });

  it("falls back to the first configured tool workdir", () => {
    const workTree = resolveRuntimeWorkTree({
      aiCommand: "codebuddy",
      tools: {
        claude: { workDir: "/claude" },
      },
    });

    expect(workTree).toBe("/claude");
  });
});

describe("normalizeWorkspaceConfig", () => {
  it("keeps runtime keep-awake disabled by default", async () => {
    const { normalizeWorkspaceConfig } = await import("./workspace.js");

    expect(normalizeWorkspaceConfig(undefined).runtime?.keepAwake).toBe(false);
  });

  it("preserves runtime keep-awake when provided", async () => {
    const { normalizeWorkspaceConfig } = await import("./workspace.js");

    expect(
      normalizeWorkspaceConfig({
        runtime: {
          keepAwake: true,
        },
      }).runtime?.keepAwake,
    ).toBe(true);
  });
});
