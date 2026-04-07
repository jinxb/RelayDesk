import { describe, expect, it } from "vitest";
import type { ChannelHealth, ChannelKey } from "../../lib/models";
import { buildChannelListSummary } from "./ChannelPanels";

function createHealth(
  overrides: Partial<Record<ChannelKey, ChannelHealth>> = {},
): Partial<Record<ChannelKey, ChannelHealth>> {
  return {
    telegram: { configured: false, enabled: false, healthy: false, message: "" },
    feishu: { configured: false, enabled: false, healthy: false, message: "" },
    qq: { configured: false, enabled: false, healthy: false, message: "" },
    wechat: { configured: false, enabled: false, healthy: false, message: "" },
    wework: { configured: false, enabled: false, healthy: false, message: "" },
    dingtalk: { configured: false, enabled: false, healthy: false, message: "" },
    ...overrides,
  };
}

describe("buildChannelListSummary", () => {
  it("keeps the simple summary when no pending runtime channel exists", () => {
    expect(buildChannelListSummary({
      enabledCount: 2,
      healthyCount: 2,
      health: createHealth({
        telegram: { configured: true, enabled: true, healthy: true, message: "" },
        feishu: { configured: true, enabled: true, healthy: true, message: "" },
      }),
    })).toBe("2 已启用 / 2 已完成基础配置");
  });

  it("summarizes enabled versus configured counts without special WeChat pending states", () => {
    expect(buildChannelListSummary({
      enabledCount: 1,
      healthyCount: 1,
      health: createHealth({
        wechat: {
          configured: true,
          enabled: true,
          healthy: true,
          message: "ilink/getupdates credentials are in place.",
        },
      }),
    })).toBe("1 已启用 / 1 已完成基础配置");
  });

  it("keeps the same summary shape when some enabled channels still need repair", () => {
    expect(buildChannelListSummary({
      enabledCount: 2,
      healthyCount: 1,
      health: createHealth({
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
      }),
    })).toBe("2 已启用 / 1 已完成基础配置");
  });
});
