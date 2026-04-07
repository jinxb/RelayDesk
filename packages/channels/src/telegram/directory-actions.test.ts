import { describe, expect, it } from "vitest";
import {
  createTelegramDirectoryCallbackData,
  resolveTelegramDirectoryCallbackData,
} from "./directory-actions.js";

describe("Telegram directory actions", () => {
  it("creates short callback payloads for directory picker actions", () => {
    const data = createTelegramDirectoryCallbackData(
      "user-1",
      "/Users/example/workspace/demo-project/very/long/path/for/testing",
    );

    expect(data.startsWith("cdt:")).toBe(true);
    expect(data.length).toBeLessThanOrEqual(64);
    expect(resolveTelegramDirectoryCallbackData(data)).toEqual({
      userId: "user-1",
      path: "/Users/example/workspace/demo-project/very/long/path/for/testing",
    });
  });
});
