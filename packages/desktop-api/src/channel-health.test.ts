import { describe, expect, it } from "vitest";
import { getChannelHealthSnapshot } from "./channel-health.js";

describe("getChannelHealthSnapshot", () => {
  it("marks configured channels as enabled and healthy when credentials exist", () => {
    const snapshot = getChannelHealthSnapshot(
      {
        platforms: {
          telegram: {
            enabled: true,
            botToken: "tg-token",
          },
          feishu: {
            enabled: true,
            appId: "cli_a",
            appSecret: "secret",
          },
          qq: {
            enabled: true,
            appId: "qq-app",
            secret: "qq-secret",
          },
          wework: {
            enabled: true,
            corpId: "ww-id",
            secret: "ww-secret",
          },
          dingtalk: {
            enabled: true,
            clientId: "dt-id",
            clientSecret: "dt-secret",
          },
        },
      },
      {},
    );

    expect(snapshot.telegram.healthy).toBe(true);
    expect(snapshot.feishu.enabled).toBe(true);
    expect(snapshot.qq.configured).toBe(true);
    expect(snapshot.wework.message).toContain("Robot socket");
    expect(snapshot.dingtalk.message).toContain("Application");
  });

  it("prefers runtime environment values over file values", () => {
    const snapshot = getChannelHealthSnapshot(
      {
        platforms: {
          qq: {
            enabled: true,
            appId: "",
            secret: "",
          },
        },
      },
      {
        QQ_BOT_APPID: "runtime-app",
        QQ_BOT_SECRET: "runtime-secret",
      } as NodeJS.ProcessEnv,
    );

    expect(snapshot.qq.configured).toBe(true);
    expect(snapshot.qq.healthy).toBe(true);
  });

  it("marks WeChat standard OAuth-only config as unsupported", () => {
    const snapshot = getChannelHealthSnapshot({
      platforms: {
        wechat: {
          enabled: true,
          appId: "wx-app",
          appSecret: "wx-secret",
        },
      },
    });

    expect(snapshot.wechat.configured).toBe(false);
    expect(snapshot.wechat.healthy).toBe(false);
    expect(snapshot.wechat.message).toContain("legacy AGP/OAuth fields");
  });

  it("marks WeChat ilink config as healthy when required credentials exist", () => {
    const snapshot = getChannelHealthSnapshot({
      platforms: {
        wechat: {
          enabled: true,
          token: "wx-token",
          baseUrl: "https://ilink.example.com",
        },
      },
    });

    expect(snapshot.wechat.configured).toBe(true);
    expect(snapshot.wechat.enabled).toBe(true);
    expect(snapshot.wechat.healthy).toBe(true);
    expect(snapshot.wechat.message).toContain("credentials are in place");
  });
});
