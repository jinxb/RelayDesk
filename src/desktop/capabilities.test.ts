import { describe, expect, it } from "vitest";
import { CHANNEL_CAPABILITIES } from "../../packages/interaction/src/shared/capabilities.js";
import { desktopChannelCapabilities } from "./capabilities";

describe("desktop channel capabilities", () => {
  it("reuses the shared capability matrix", () => {
    expect(desktopChannelCapabilities).toBe(CHANNEL_CAPABILITIES);
    expect(desktopChannelCapabilities.telegram.outbound.file).toBe("native");
    expect(desktopChannelCapabilities.telegram.outbound.voice).toBe("native");
    expect(desktopChannelCapabilities.telegram.outbound.video).toBe("native");
    expect(desktopChannelCapabilities.feishu.outbound.file).toBe("native");
    expect(desktopChannelCapabilities.qq.outbound.file).toBe("fallback");
    expect(desktopChannelCapabilities.wechat.outbound.card).toBe("none");
    expect(desktopChannelCapabilities.wechat.outbound.image).toBe("native");
    expect(desktopChannelCapabilities.wechat.outbound.file).toBe("native");
    expect(desktopChannelCapabilities.wechat.outbound.typing).toBe("native");
    expect(desktopChannelCapabilities.wechat.outbound.video).toBe("native");
    expect(desktopChannelCapabilities.wework.outbound.file).toBe("native");
    expect(desktopChannelCapabilities.wework.outbound.voice).toBe("native");
    expect(desktopChannelCapabilities.wework.outbound.video).toBe("native");
    expect(desktopChannelCapabilities.dingtalk.outbound.file).toBe("native");
  });
});
