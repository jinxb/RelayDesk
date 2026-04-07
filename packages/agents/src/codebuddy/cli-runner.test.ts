import { afterEach, describe, expect, it } from "vitest";
import {
  buildCodeBuddyArgs,
  extractBufferedPayloads,
  flushBufferedPayloads,
  resolveCodeBuddyIdleTimeoutMs,
} from "./cli-runner.js";

afterEach(() => {
  delete process.env.CODEBUDDY_IDLE_TIMEOUT_MS;
});

describe("buildCodeBuddyArgs", () => {
  it("builds print-mode stream-json args for new sessions", () => {
    const args = buildCodeBuddyArgs("fix the bug", undefined, {
      skipPermissions: true,
    });

    expect(args).toEqual([
      "--print",
      "--output-format",
      "stream-json",
      "--dangerously-skip-permissions",
      "fix the bug",
    ]);
  });

  it("adds resume and permission mode for existing sessions", () => {
    const args = buildCodeBuddyArgs("review this change", "session-123", {
      permissionMode: "plan",
      model: "deepseek-v3",
    });

    expect(args).toEqual([
      "--print",
      "--output-format",
      "stream-json",
      "--permission-mode",
      "plan",
      "--model",
      "deepseek-v3",
      "--resume",
      "session-123",
      "review this change",
    ]);
  });

  it("keeps stream-json output for current CodeBuddy CLI compatibility", () => {
    const args = buildCodeBuddyArgs("say hi", undefined);

    expect(args.slice(0, 3)).toEqual([
      "--print",
      "--output-format",
      "stream-json",
    ]);
  });
});

describe("CodeBuddy stream parsing", () => {
  it("parses newline-delimited JSON payloads emitted by current CodeBuddy CLI", () => {
    const state = {
      buffer: [
        '{"type":"system","subtype":"init"}',
        '{"type":"assistant","message":{"content":[{"type":"text","text":"ok"}]}}',
        "",
      ].join("\n"),
    };

    expect(extractBufferedPayloads(state)).toEqual([
      '{"type":"system","subtype":"init"}',
      '{"type":"assistant","message":{"content":[{"type":"text","text":"ok"}]}}',
    ]);
    expect(state.buffer).toBe("");
  });

  it("flushes trailing JSON payload without newline on close", () => {
    const state = {
      buffer: '{"type":"result","is_error":false,"result":"done"}',
    };

    expect(flushBufferedPayloads(state)).toEqual([
      '{"type":"result","is_error":false,"result":"done"}',
    ]);
    expect(state.buffer).toBe("");
  });
});

describe("resolveCodeBuddyIdleTimeoutMs", () => {
  it("prefers explicit idle timeout settings and clamps them to total timeout", () => {
    process.env.CODEBUDDY_IDLE_TIMEOUT_MS = "900000";

    expect(resolveCodeBuddyIdleTimeoutMs(300000, 180000)).toBe(180000);
  });

  it("falls back to the environment variable when no explicit idle timeout is provided", () => {
    process.env.CODEBUDDY_IDLE_TIMEOUT_MS = "240000";

    expect(resolveCodeBuddyIdleTimeoutMs(undefined, 0)).toBe(240000);
  });
});
