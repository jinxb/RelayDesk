import { describe, expect, it } from "vitest";
import { buildProbeSuccessStatus } from "../../probe-status";
import { resolveWizardProbeState } from "./wizard-probe-state";

describe("resolveWizardProbeState", () => {
  it("maps ordinary successful probes to a verified state", () => {
    const state = resolveWizardProbeState({
      channelKey: "telegram",
      config: {
        enabled: true,
        botToken: "tg-token",
        allowedUserIds: [],
      },
      probe: {
        success: true,
        message: "Telegram handshake succeeded.",
        testedAt: "2026-03-29T01:00:00.000Z",
        stale: false,
      },
    });

    expect(state.badgeLabel).toBe("已验证");
    expect(state.badgeColor).toBe("green");
    expect(state.detail).toContain("Telegram handshake succeeded.");
  });

  it("treats configured WeChat as verified when the probe succeeded", () => {
    const state = resolveWizardProbeState({
      channelKey: "wechat",
      config: {
        enabled: true,
        token: "wx-token",
        baseUrl: "https://ilink.example.com",
        allowedUserIds: [],
      },
      probe: {
        success: true,
        message: "WeChat ilink/getupdates probe succeeded.",
        testedAt: "2026-03-29T01:00:00.000Z",
        stale: false,
      },
    });

    expect(state.badgeLabel).toBe("已验证");
    expect(state.badgeColor).toBe("green");
    expect(state.detail).toContain("probe succeeded");
  });

  it("still surfaces WeChat probe failures as repair-needed", () => {
    const state = resolveWizardProbeState({
      channelKey: "wechat",
      config: {
        enabled: true,
        token: "wx-token",
        baseUrl: "https://ilink.example.com",
        allowedUserIds: [],
      },
      probe: {
        success: false,
        message: "401 unauthorized",
        testedAt: "2026-03-29T01:00:00.000Z",
        stale: false,
      },
    });

    expect(state.badgeLabel).toBe("需修复");
    expect(state.badgeColor).toBe("red");
    expect(state.detail).toContain("401 unauthorized");
  });
});

describe("buildProbeSuccessStatus", () => {
  it("keeps ordinary channels on success tone after a successful probe", () => {
    expect(buildProbeSuccessStatus({
      channel: "telegram",
      channelName: "Telegram",
      config: {
        enabled: true,
        botToken: "tg-token",
        allowedUserIds: [],
      },
    })).toEqual({
      message: "Telegram 连通性检测完成。",
      tone: "success",
    });
  });

  it("keeps successful WeChat probes on success tone", () => {
    expect(buildProbeSuccessStatus({
      channel: "wechat",
      channelName: "微信",
      config: {
        enabled: true,
        token: "wx-token",
        baseUrl: "https://ilink.example.com",
        allowedUserIds: [],
      },
    })).toEqual({
      message: "微信 连通性检测完成。",
      tone: "success",
    });
  });
});
