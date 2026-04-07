import { describe, expect, it } from "vitest";
import { buildScopedSessionOwnerId } from "../../../state/src/index.js";
import { RequestQueue } from "./request-queue.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("RequestQueue", () => {
  it("isolates queues for different chat scopes from the same user", async () => {
    const queue = new RequestQueue();
    const first = deferred();
    const scopeA = buildScopedSessionOwnerId({
      platform: "telegram",
      chatId: "chat-a",
      userId: "user-1",
    });
    const scopeB = buildScopedSessionOwnerId({
      platform: "telegram",
      chatId: "chat-b",
      userId: "user-1",
    });

    const resultA = queue.enqueue(scopeA, "conv-a", "first", async () => {
      await first.promise;
    });
    const resultB = queue.enqueue(scopeB, "conv-b", "second", async () => {});

    expect(resultA).toBe("running");
    expect(resultB).toBe("running");
    expect(queue.inspect(scopeA, "conv-a")).toEqual({ running: true, pending: 0 });
    expect(queue.inspect(scopeB, "conv-b")).toEqual({ running: true, pending: 0 });

    first.resolve();
    await first.promise;
  });
});
