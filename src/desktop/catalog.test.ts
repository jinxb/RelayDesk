import { describe, expect, it } from "vitest";
import { channelDefinitions } from "./catalog";

describe("desktop catalog channel copy", () => {
  it("keeps QQ copy explicit about private/group native media and channel fallback", () => {
    const qq = channelDefinitions.find((channel) => channel.key === "qq");
    expect(qq).toBeDefined();
    expect(qq?.mode).toBe("私群原生 + 频道回退");
    expect(qq?.summary).toContain("私聊与群聊支持原生图片/文件回传");
    expect(qq?.summary).toContain("频道媒体继续保持显式文本回退");
  });

  it("keeps WeChat copy explicit about the currently supported native media set", () => {
    const wechat = channelDefinitions.find((channel) => channel.key === "wechat");
    expect(wechat).toBeDefined();
    expect(wechat?.summary).toContain("原生图片/文件/视频回传");
  });
});
