import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DINGTALK_CONNECT_TIMEOUT_MS,
  DINGTALK_DISCONNECT_GRACE_MS,
  DINGTALK_REGISTER_TIMEOUT_MS,
  resolveReconnectDelayMs,
  runDingTalkGatewaySession,
  startManagedDingTalkGateway,
  stopManagedDingTalkGateway,
} from "./gateway.js";

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("DingTalk gateway session", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopManagedDingTalkGateway();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("returns connect_timeout when connect never becomes ready", async () => {
    const logger = createLogger();
    const client = {
      connected: false,
      registered: false,
      connect: vi.fn(() => new Promise<void>(() => {})),
      disconnect: vi.fn(),
    };

    const promise = runDingTalkGatewaySession({
      client,
      signal: new AbortController().signal,
      logger,
      onReady: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(DINGTALK_CONNECT_TIMEOUT_MS + 1);

    await expect(promise).resolves.toEqual({
      kind: "reconnect",
      reason: "connect_timeout",
    });
  });

  it("returns register_timeout when the client never registers", async () => {
    const logger = createLogger();
    const client = {
      connected: false,
      registered: false,
      connect: vi.fn(async () => {
        client.connected = true;
      }),
      disconnect: vi.fn(),
    };

    const promise = runDingTalkGatewaySession({
      client,
      signal: new AbortController().signal,
      logger,
      onReady: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(DINGTALK_REGISTER_TIMEOUT_MS + 5_000);

    await expect(promise).resolves.toEqual({
      kind: "reconnect",
      reason: "register_timeout",
    });
  });

  it("returns connection_lost after a ready client disconnects beyond the grace window", async () => {
    const logger = createLogger();
    const onReady = vi.fn();
    const client = {
      connected: false,
      registered: false,
      connect: vi.fn(async () => {
        client.connected = true;
        client.registered = true;
      }),
      disconnect: vi.fn(),
    };

    const promise = runDingTalkGatewaySession({
      client,
      signal: new AbortController().signal,
      logger,
      onReady,
    });

    await vi.advanceTimersByTimeAsync(1);
    client.connected = false;
    client.registered = false;
    await vi.advanceTimersByTimeAsync(DINGTALK_DISCONNECT_GRACE_MS + 5_000);

    await expect(promise).resolves.toEqual({
      kind: "reconnect",
      reason: "connection_lost",
    });
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("computes bounded reconnect delays with jitter", () => {
    expect(resolveReconnectDelayMs(1, 0.5)).toBe(1_000);
    expect(resolveReconnectDelayMs(10, 0.5)).toBeLessThanOrEqual(60_000);
    expect(resolveReconnectDelayMs(10, 0.5)).toBeGreaterThanOrEqual(1_000);
  });

  it("fails startup after repeated pre-ready connect timeouts", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const logger = createLogger();

    const readyPromise = startManagedDingTalkGateway({
      cfg: {
        dingtalkClientId: "dt-app",
        dingtalkClientSecret: "dt-secret",
      } as never,
      logger,
      createClient: () => ({
        connected: false,
        registered: false,
        connect: () => new Promise<void>(() => {}),
        disconnect: () => {},
      }) as never,
      bindClient: () => {},
      clearClient: () => {},
      formatInitError: (error) => String(error),
    });
    const failure = readyPromise.catch((error) => error);

    await vi.advanceTimersByTimeAsync(
      DINGTALK_CONNECT_TIMEOUT_MS * 3 + 5_000,
    );

    await expect(failure).resolves.toEqual(
      expect.objectContaining({
        message: "DingTalk gateway connect timeout before becoming ready.",
      }),
    );
  });
});
