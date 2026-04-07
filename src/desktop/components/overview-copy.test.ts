import { describe, expect, it } from "vitest";
import { buildOverviewChannelSummary } from "./overview-copy";

describe("buildOverviewChannelSummary", () => {
  it("compresses common provider credential errors into short Chinese copy", () => {
    expect(buildOverviewChannelSummary({
      enabled: true,
      health: {
        configured: false,
        enabled: true,
        healthy: false,
        message: "App ID and secret are both required.",
      },
      probe: undefined,
    })).toBe("缺少 App ID 与 Secret");

    expect(buildOverviewChannelSummary({
      enabled: true,
      health: {
        configured: false,
        enabled: true,
        healthy: false,
        message: "WeChat requires ilink/getupdates credentials: token and baseUrl.",
      },
      probe: undefined,
    })).toBe("缺少 token 与 baseUrl");
  });

  it("uses short operational summaries for healthy and stale states", () => {
    expect(buildOverviewChannelSummary({
      enabled: true,
      health: {
        configured: true,
        enabled: true,
        healthy: true,
        message: "",
      },
      probe: {
        success: true,
        message: "ok",
        testedAt: "2026-03-31T12:00:00.000Z",
        stale: false,
      },
    })).toBe("最近检测通过");

    expect(buildOverviewChannelSummary({
      enabled: true,
      health: {
        configured: true,
        enabled: true,
        healthy: true,
        message: "",
      },
      probe: {
        success: true,
        message: "ok",
        testedAt: "2026-03-31T12:00:00.000Z",
        stale: true,
      },
    })).toBe("配置已变更，待重检");
  });
});
