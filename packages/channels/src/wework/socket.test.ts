import { beforeEach, describe, expect, it, vi } from "vitest";

const { sockets, MockWebSocket } = vi.hoisted(() => {
  class MockSocket {
    readyState = 0;
    private listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    send = vi.fn();
    close = vi.fn(() => {
      this.readyState = 3;
      this.emit("close");
    });
    removeAllListeners = vi.fn(() => {
      this.listeners.clear();
    });

    on(event: string, listener: (...args: unknown[]) => void) {
      const current = this.listeners.get(event) ?? [];
      current.push(listener);
      this.listeners.set(event, current);
    }

    emit(event: string, ...args: unknown[]) {
      for (const listener of this.listeners.get(event) ?? []) {
        listener(...args);
      }
    }
  }

  const sockets: MockSocket[] = [];
  class MockWebSocket extends MockSocket {
    constructor(_url: string) {
      super();
      sockets.push(this);
    }
  }

  return { sockets, MockWebSocket };
});

vi.mock("ws", () => ({
  WebSocket: MockWebSocket,
}));

describe("WeWork socket", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    sockets.length = 0;

    const runtime = await import("./runtime.js");
    runtime.weWorkRuntime.config = {
      botId: "bot-1",
      secret: "secret-1",
      websocketUrl: "ws://gateway",
    };
    runtime.weWorkRuntime.connectionState = "disconnected";
    runtime.weWorkRuntime.reconnectAttempts = 0;
    runtime.weWorkRuntime.shouldReconnect = false;
    runtime.weWorkRuntime.isStopping = false;
    runtime.weWorkRuntime.ws = null;
    runtime.weWorkRuntime.messageHandler = async () => {};
    runtime.weWorkRuntime.stateChangeHandler = null;
    runtime.clearReconnectTimer();
    runtime.clearHeartbeatTimer();
    runtime.clearConnectTimer();
    runtime.clearSubscribeAckTimer();
    runtime.clearWatchdogTimer();
  });

  it("fails if the websocket never opens", async () => {
    const { connectWeWorkSocket } = await import("./socket.js");
    const promise = connectWeWorkSocket();
    const failure = promise.catch((error) => error);

    await vi.advanceTimersByTimeAsync(15_001);

    await expect(failure).resolves.toEqual(
      expect.objectContaining({
        message: "WeWork WebSocket connect timed out",
      }),
    );
  });

  it("fails if subscribe acknowledgement never arrives", async () => {
    const { connectWeWorkSocket } = await import("./socket.js");
    const promise = connectWeWorkSocket();
    const failure = promise.catch((error) => error);
    sockets[0].readyState = 1;
    sockets[0].emit("open");

    await vi.advanceTimersByTimeAsync(15_001);

    await expect(failure).resolves.toEqual(
      expect.objectContaining({
        message: "WeWork subscribe acknowledgement timed out",
      }),
    );
  });

  it("does not reconnect after an intentional stop", async () => {
    const { connectWeWorkSocket, stopWeWorkSocket } = await import("./socket.js");
    const promise = connectWeWorkSocket();
    sockets[0].readyState = 1;
    sockets[0].emit("open");
    sockets[0].emit("message", Buffer.from(JSON.stringify({
      headers: { req_id: "req-1" },
      errcode: 0,
      errmsg: "ok",
    })));
    await promise;

    stopWeWorkSocket();
    await vi.advanceTimersByTimeAsync(6_000);

    expect(sockets).toHaveLength(1);
  });

  it("reconnects when the socket stays non-open past the grace window", async () => {
    const { connectWeWorkSocket } = await import("./socket.js");
    const promise = connectWeWorkSocket();
    sockets[0].readyState = 1;
    sockets[0].emit("open");
    sockets[0].emit("message", Buffer.from(JSON.stringify({
      headers: { req_id: "req-1" },
      errcode: 0,
      errmsg: "ok",
    })));
    await promise;

    sockets[0].readyState = 0;
    await vi.advanceTimersByTimeAsync(46_000);

    expect(sockets[0].close).toHaveBeenCalled();
    expect(sockets).toHaveLength(2);
  });
});
