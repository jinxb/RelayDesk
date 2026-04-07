import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTelegramStreamUpdater } from "./stream-updater.js";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

describe("createTelegramStreamUpdater", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("waits for an in-flight streaming update before finishing", async () => {
    const deferred = createDeferred<void>();
    const sendUpdate = vi.fn(() => deferred.promise);
    const updater = createTelegramStreamUpdater({
      sendUpdate,
      getDelay: () => 0,
    });

    updater.schedule("partial output");
    await vi.advanceTimersByTimeAsync(150);
    expect(sendUpdate).toHaveBeenCalledTimes(1);

    const finishPromise = updater.finish();
    let finished = false;
    void finishPromise.then(() => {
      finished = true;
    });
    await Promise.resolve();

    expect(finished).toBe(false);

    deferred.resolve();
    await finishPromise;

    expect(finished).toBe(true);
  });

  it("cancels pending debounced streaming updates on finish", async () => {
    const sendUpdate = vi.fn(async () => {});
    const updater = createTelegramStreamUpdater({
      sendUpdate,
      getDelay: () => 0,
    });

    updater.schedule("partial output");
    await updater.finish();
    await vi.advanceTimersByTimeAsync(500);

    expect(sendUpdate).not.toHaveBeenCalled();
  });
});
