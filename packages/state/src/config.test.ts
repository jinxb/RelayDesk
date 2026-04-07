import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  accessSyncMock,
  existsSyncMock,
  mkdirSyncMock,
  readFileSyncMock,
  writeFileSyncMock,
  execFileSyncMock,
} = vi.hoisted(() => ({
  accessSyncMock: vi.fn(),
  existsSyncMock: vi.fn(),
  mkdirSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
  execFileSyncMock: vi.fn(),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    accessSync: accessSyncMock,
    existsSync: existsSyncMock,
    mkdirSync: mkdirSyncMock,
    readFileSync: readFileSyncMock,
    writeFileSync: writeFileSyncMock,
  };
});

vi.mock("node:child_process", () => ({
  execFileSync: execFileSyncMock,
}));

import {
  getPlatformsWithCredentials,
  loadConfig,
  loadFileConfig,
  needsSetup,
} from "./config.js";

describe("config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.RELAYDESK_DISABLE_GLOBAL_CLAUDE_SETTINGS;
    delete process.env.AI_COMMAND;
    delete process.env.WECHAT_TOKEN;
    delete process.env.WECHAT_BASE_URL;
    delete process.env.CODEX_IDLE_TIMEOUT_MS;
    delete process.env.CODEBUDDY_IDLE_TIMEOUT_MS;
    readFileSyncMock.mockImplementation(() => {
      throw new Error("missing");
    });
    existsSyncMock.mockReturnValue(true);
    accessSyncMock.mockImplementation(() => undefined);
  });

  it("loadFileConfig returns empty object when config file is missing", () => {
    const file = loadFileConfig();
    expect(file).toEqual({});
  });

  it("skips global Claude settings merge when isolation flag is enabled", () => {
    process.env.RELAYDESK_DISABLE_GLOBAL_CLAUDE_SETTINGS = "1";
    readFileSyncMock.mockImplementation((path: string) => {
      if (path.endsWith("config.json")) {
        return JSON.stringify({
          aiCommand: "claude",
          tools: {
            claude: {
              workDir: "/tmp/relaydesk",
              timeoutMs: 600000,
            },
          },
          platforms: {
            telegram: {
              enabled: true,
              botToken: "123:abc",
            },
          },
        });
      }

      if (path.includes(".claude")) {
        return JSON.stringify({
          env: {
            ANTHROPIC_AUTH_TOKEN: "global-token",
          },
        });
      }

      throw new Error("missing");
    });

    expect(() => loadConfig()).toThrow(/Claude 凭证缺失/);
  });

  it("enables WeChat alongside other runnable platforms when ilink credentials exist", () => {
    process.env.RELAYDESK_DISABLE_GLOBAL_CLAUDE_SETTINGS = "1";
    readFileSyncMock.mockImplementation((path: string) => {
      if (path.endsWith("config.json")) {
        return JSON.stringify({
          aiCommand: "codex",
          tools: {
            codex: {
              cliPath: "/usr/bin/codex",
            },
          },
          platforms: {
            telegram: {
              enabled: true,
              botToken: "123:abc",
            },
            wechat: {
              enabled: true,
              token: "wx-token",
              baseUrl: "https://ilink.example.com",
            },
          },
        });
      }

      throw new Error("missing");
    });

    const config = loadConfig();

    expect(config.enabledPlatforms).toEqual(["telegram", "wechat"]);
    expect(config.platforms.wechat?.enabled).toBe(true);
    expect(config.wechatToken).toBe("wx-token");
    expect(config.wechatBaseUrl).toBe("https://ilink.example.com");
  });

  it("accepts WeChat as the only configured platform when ilink credentials exist", () => {
    process.env.RELAYDESK_DISABLE_GLOBAL_CLAUDE_SETTINGS = "1";
    readFileSyncMock.mockImplementation((path: string) => {
      if (path.endsWith("config.json")) {
        return JSON.stringify({
          aiCommand: "codex",
          tools: {
            codex: {
              cliPath: "/usr/bin/codex",
            },
          },
          platforms: {
            wechat: {
              enabled: true,
              token: "wx-token",
              baseUrl: "https://ilink.example.com",
            },
          },
        });
      }

      throw new Error("missing");
    });

    const config = loadConfig();
    expect(config.enabledPlatforms).toEqual(["wechat"]);
    expect(config.platforms.wechat?.enabled).toBe(true);
  });

  it("uses separate Codex total timeout and idle timeout defaults", () => {
    process.env.RELAYDESK_DISABLE_GLOBAL_CLAUDE_SETTINGS = "1";
    readFileSyncMock.mockImplementation((path: string) => {
      if (path.endsWith("config.json")) {
        return JSON.stringify({
          aiCommand: "codex",
          tools: {
            codex: {
              cliPath: "/usr/bin/codex",
            },
          },
          platforms: {
            telegram: {
              enabled: true,
              botToken: "123:abc",
            },
          },
        });
      }

      throw new Error("missing");
    });

    const config = loadConfig();

    expect(config.codexTimeoutMs).toBe(1800000);
    expect(config.codexIdleTimeoutMs).toBe(600000);
    expect(config.codebuddyTimeoutMs).toBe(600000);
    expect(config.codebuddyIdleTimeoutMs).toBe(600000);
  });

  it("migrates the legacy 10-minute Codex timeout to the new baseline", () => {
    process.env.RELAYDESK_DISABLE_GLOBAL_CLAUDE_SETTINGS = "1";
    readFileSyncMock.mockImplementation((path: string) => {
      if (path.endsWith("config.json")) {
        return JSON.stringify({
          aiCommand: "codex",
          tools: {
            codex: {
              cliPath: "/usr/bin/codex",
              timeoutMs: 600000,
            },
          },
          platforms: {
            telegram: {
              enabled: true,
              botToken: "123:abc",
            },
          },
        });
      }

      throw new Error("missing");
    });

    const config = loadConfig();

    expect(config.codexTimeoutMs).toBe(1800000);
    expect(writeFileSyncMock).toHaveBeenCalledOnce();
    expect(writeFileSyncMock.mock.calls[0]?.[1]).toContain("\"timeoutMs\": 1800000");
  });

  it("allows idle timeout overrides from env and file config", () => {
    process.env.RELAYDESK_DISABLE_GLOBAL_CLAUDE_SETTINGS = "1";
    process.env.CODEX_IDLE_TIMEOUT_MS = "420000";
    readFileSyncMock.mockImplementation((path: string) => {
      if (path.endsWith("config.json")) {
        return JSON.stringify({
          aiCommand: "codex",
          tools: {
            codex: {
              cliPath: "/usr/bin/codex",
              idleTimeoutMs: 300000,
            },
            codebuddy: {
              idleTimeoutMs: 240000,
            },
          },
          platforms: {
            telegram: {
              enabled: true,
              botToken: "123:abc",
            },
          },
        });
      }

      throw new Error("missing");
    });

    const config = loadConfig();

    expect(config.codexIdleTimeoutMs).toBe(420000);
    expect(config.codebuddyIdleTimeoutMs).toBe(240000);
    delete process.env.CODEX_IDLE_TIMEOUT_MS;
  });

  it("does not require setup when only WeChat ilink credentials exist in config", () => {
    readFileSyncMock.mockImplementation((path: string) => {
      if (path.endsWith("config.json")) {
        return JSON.stringify({
          platforms: {
            wechat: {
              enabled: true,
              token: "wx-token",
              baseUrl: "https://ilink.example.com",
            },
          },
        });
      }

      throw new Error("missing");
    });

    expect(needsSetup()).toBe(false);
  });

  it("lists only runnable platforms when collecting platforms with credentials", () => {
    expect(
      getPlatformsWithCredentials({
        enabledPlatforms: ["telegram"],
        runtime: { keepAwake: false },
        telegramBotToken: "tg-token",
        wechatToken: "wx-token",
        wechatBaseUrl: "https://ilink.example.com",
        feishuAppId: "",
        feishuAppSecret: "",
        qqAppId: "",
        qqSecret: "",
        weworkCorpId: "",
        weworkSecret: "",
        dingtalkClientId: "",
        dingtalkClientSecret: "",
        dingtalkCardTemplateId: "",
        allowedUserIds: [],
        telegramAllowedUserIds: [],
        feishuAllowedUserIds: [],
        qqAllowedUserIds: [],
        wechatAllowedUserIds: [],
        weworkAllowedUserIds: [],
        dingtalkAllowedUserIds: [],
        aiCommand: "codex",
        codexCliPath: "codex",
        codebuddyCliPath: "codebuddy",
        claudeWorkDir: process.cwd(),
        claudeTimeoutMs: 600000,
        codexTimeoutMs: 600000,
        codexIdleTimeoutMs: 600000,
        codebuddyTimeoutMs: 600000,
        codebuddyIdleTimeoutMs: 600000,
        logDir: "/tmp",
        logLevel: "INFO",
        platforms: {
          telegram: { enabled: true, allowedUserIds: [] },
          feishu: { enabled: false, allowedUserIds: [] },
          qq: { enabled: false, allowedUserIds: [] },
          wechat: {
            enabled: false,
            token: "wx-token",
            baseUrl: "https://ilink.example.com",
            allowedUserIds: [],
          },
          wework: { enabled: false, allowedUserIds: [] },
          dingtalk: { enabled: false, allowedUserIds: [] },
        },
      }),
    ).toEqual(["telegram"]);
  });

  it("uses the updated runnable-platform error message when no platform is configured", () => {
    process.env.RELAYDESK_DISABLE_GLOBAL_CLAUDE_SETTINGS = "1";
    readFileSyncMock.mockImplementation((path: string) => {
      if (path.endsWith("config.json")) {
        return JSON.stringify({
          aiCommand: "codex",
          tools: {
            codex: {
              cliPath: "/usr/bin/codex",
            },
          },
          platforms: {},
        });
      }

      throw new Error("missing");
    });

    expect(() => loadConfig()).toThrow("至少需要配置 Telegram、Feishu、QQ、微信、企业微信或 DingTalk");
  });
});
