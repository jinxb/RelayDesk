import { describe, expect, it } from "vitest";
import {
  CHANNEL_CAPABILITIES,
  buildImageFallbackMessage,
  buildUnsupportedInboundMessage,
} from "./capabilities.js";

describe("channel capabilities", () => {
  it("defines core inbound and outbound capabilities for every channel", () => {
    expect(CHANNEL_CAPABILITIES.telegram.inbound.image).toBe("native");
    expect(CHANNEL_CAPABILITIES.telegram.inbound.file).toBe("native");
    expect(CHANNEL_CAPABILITIES.telegram.outbound.file).toBe("native");
    expect(CHANNEL_CAPABILITIES.telegram.outbound.voice).toBe("native");
    expect(CHANNEL_CAPABILITIES.telegram.outbound.video).toBe("native");
    expect(CHANNEL_CAPABILITIES.feishu.outbound.card).toBe("native");
    expect(CHANNEL_CAPABILITIES.feishu.outbound.file).toBe("native");
    expect(CHANNEL_CAPABILITIES.feishu.outbound.voice).toBe("none");
    expect(CHANNEL_CAPABILITIES.feishu.outbound.video).toBe("none");
    expect(CHANNEL_CAPABILITIES.qq.inbound.image).toBe("fallback");
    expect(CHANNEL_CAPABILITIES.qq.inbound.voice).toBe("fallback");
    expect(CHANNEL_CAPABILITIES.qq.inbound.video).toBe("fallback");
    expect(CHANNEL_CAPABILITIES.qq.outbound.streamEdit).toBe("none");
    expect(CHANNEL_CAPABILITIES.qq.outbound.streamPush).toBe("none");
    expect(CHANNEL_CAPABILITIES.qq.outbound.file).toBe("fallback");
    expect(CHANNEL_CAPABILITIES.qq.outbound.voice).toBe("none");
    expect(CHANNEL_CAPABILITIES.qq.outbound.video).toBe("none");
    expect(CHANNEL_CAPABILITIES.wechat.inbound.image).toBe("fallback");
    expect(CHANNEL_CAPABILITIES.wechat.outbound.streamEdit).toBe("none");
    expect(CHANNEL_CAPABILITIES.wechat.outbound.streamPush).toBe("none");
    expect(CHANNEL_CAPABILITIES.wechat.outbound.image).toBe("native");
    expect(CHANNEL_CAPABILITIES.wechat.outbound.file).toBe("native");
    expect(CHANNEL_CAPABILITIES.wechat.outbound.voice).toBe("fallback");
    expect(CHANNEL_CAPABILITIES.wechat.outbound.video).toBe("native");
    expect(CHANNEL_CAPABILITIES.wechat.outbound.card).toBe("none");
    expect(CHANNEL_CAPABILITIES.wechat.outbound.typing).toBe("native");
    expect(CHANNEL_CAPABILITIES.wework.inbound.video).toBe("fallback");
    expect(CHANNEL_CAPABILITIES.wework.outbound.image).toBe("native");
    expect(CHANNEL_CAPABILITIES.wework.outbound.file).toBe("native");
    expect(CHANNEL_CAPABILITIES.wework.outbound.voice).toBe("native");
    expect(CHANNEL_CAPABILITIES.wework.outbound.video).toBe("native");
    expect(CHANNEL_CAPABILITIES.dingtalk.inbound.file).toBe("fallback");
    expect(CHANNEL_CAPABILITIES.dingtalk.outbound.image).toBe("native");
    expect(CHANNEL_CAPABILITIES.dingtalk.outbound.file).toBe("native");
    expect(CHANNEL_CAPABILITIES.dingtalk.outbound.voice).toBe("none");
    expect(CHANNEL_CAPABILITIES.dingtalk.outbound.video).toBe("none");
  });

  it("builds actionable fallback copy for unsupported inbound messages", () => {
    expect(buildUnsupportedInboundMessage("dingtalk", "image")).toContain("Telegram");
    expect(buildUnsupportedInboundMessage("dingtalk", "image")).toContain("Feishu");
    expect(buildUnsupportedInboundMessage("dingtalk", "image")).toContain("文字说明");
  });

  it("builds a consistent image delivery fallback message", () => {
    expect(buildImageFallbackMessage("qq", "/tmp/out.png")).toContain("/tmp/out.png");
    expect(buildImageFallbackMessage("qq", "/tmp/out.png")).toContain("QQ");
  });
});
