import { describe, expect, it } from "vitest";
import { buildDirectoryMessage } from "./system-messages.js";

describe("system message builders", () => {
  it("builds a directory message", () => {
    expect(buildDirectoryMessage("D:/coding/relaydesk", ["- src", "- dist"])).toContain("可用目录:");
    expect(buildDirectoryMessage("D:/coding/relaydesk")).toContain("没有可访问的子目录");
  });
});
