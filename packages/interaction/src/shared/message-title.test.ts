import { describe, expect, it } from "vitest";
import { RELAYDESK_BRAND_SUFFIX } from "./utils.js";
import {
  buildCompletionSummary,
  buildMessageTitle,
  RELAYDESK_SYSTEM_TITLE,
} from "./message-title.js";

describe("buildMessageTitle", () => {
  it("uses a consistent title format for non-final statuses", () => {
    expect(buildMessageTitle("codex", "thinking")).toBe("Codex - 思考中");
    expect(buildMessageTitle("codex", "streaming")).toBe("Codex - 执行中");
    expect(buildMessageTitle("codex", "error")).toBe("Codex - 错误");
  });

  it("keeps the tool name first for done titles", () => {
    expect(buildMessageTitle("claude", "done")).toBe("Claude Code - 完成");
  });

  it("can append the Feishu brand suffix", () => {
    expect(buildMessageTitle("codebuddy", "done", { brandSuffix: true })).toBe(
      `CodeBuddy - 完成${RELAYDESK_BRAND_SUFFIX}`,
    );
  });

  it("builds a compact completion summary", () => {
    expect(buildCompletionSummary("codex", "耗时 1.2s")).toBe("Codex · 耗时 1.2s");
    expect(buildCompletionSummary("claude")).toBe("Claude Code");
  });

  it("exposes a shared system title", () => {
    expect(RELAYDESK_SYSTEM_TITLE).toBe("RelayDesk");
  });
});
