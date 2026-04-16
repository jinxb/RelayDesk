import { beforeEach, describe, expect, it, vi } from "vitest";

const { execFileSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: execFileSyncMock,
}));

import {
  resetCodexCliCachesForTests,
} from "../../agents/src/codex/cli-runner.js";
import {
  resolveRouteDefaultWorkDir as resolveRouteDefaultWorkDirFromWorkspace,
  resolveRuntimeWorkTree as resolveRuntimeWorkTreeFromWorkspace,
  validateWorkspace as validateWorkspaceFromWorkspace,
  workspaceUsedAgents as workspaceUsedAgentsFromWorkspace,
} from "./workspace.js";

const resolveRouteDefaultWorkDir = resolveRouteDefaultWorkDirFromWorkspace;
const resolveRuntimeWorkTree = resolveRuntimeWorkTreeFromWorkspace;
const validateWorkspace = validateWorkspaceFromWorkspace;
const workspaceUsedAgents = workspaceUsedAgentsFromWorkspace;

function mockCodexCli(options?: {
  readonly fullAuto?: boolean;
}) {
  const globalHelp = [
    "--cd",
    options?.fullAuto === false ? null : "--full-auto",
    "--dangerously-bypass-approvals-and-sandbox",
    "--sandbox",
    "--model",
    "--image",
  ].filter(Boolean).join("\n");
  const execHelp = [
    "--json",
    "--skip-git-repo-check",
    "If `-` is used, read from stdin.",
  ].join("\n");

  execFileSyncMock.mockImplementation((command: string, args: string[]) => {
    if (command === "which" || command === "where") {
      return Buffer.from("/usr/bin/codex");
    }
    if (args[0] === "--help") {
      return Buffer.from(globalHelp);
    }
    if (args[0] === "exec" && args[1] === "--help") {
      return Buffer.from(execHelp);
    }
    return Buffer.from("/usr/bin/codex");
  });
}

describe("workspaceUsedAgents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCodexCliCachesForTests();
    mockCodexCli();
  });

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
  beforeEach(() => {
    vi.clearAllMocks();
    resetCodexCliCachesForTests();
    mockCodexCli();
  });

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

  it("surfaces Codex CLI compatibility issues instead of generic path errors", () => {
    mockCodexCli({ fullAuto: false });

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
        },
      },
      {},
    );

    expect(result.issues).toContain(
      "当前 Codex CLI 与 RelayDesk 不兼容，缺少：--full-auto",
    );
  });
});

describe("resolveRuntimeWorkTree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCodexCliCachesForTests();
    mockCodexCli();
  });

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

  it("falls back to the user home directory when no workdir is configured", () => {
    const originalHome = process.env.HOME;
    process.env.HOME = "/tmp/home-fallback";

    try {
      expect(resolveRuntimeWorkTree({ aiCommand: "codex", tools: {}, platforms: {} })).toBe("/tmp/home-fallback");
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
    }
  });
});

describe("resolveRouteDefaultWorkDir", () => {
  it("returns the runtime fallback when the selected route has no configured workdir", () => {
    const originalHome = process.env.HOME;
    process.env.HOME = "/tmp/home-fallback";

    try {
      expect(resolveRouteDefaultWorkDir({ aiCommand: "codebuddy", tools: {}, platforms: {} }, "codebuddy")).toBe("/tmp/home-fallback");
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
    }
  });
});

describe("normalizeWorkspaceConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCodexCliCachesForTests();
    mockCodexCli();
  });

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
