import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const mocks = vi.hoisted(() => {
  const handlers: Record<string, (data: unknown) => unknown> = {};
  let readyState = 0;
  const terminateMock = vi.fn();
  const reConnectMock = vi.fn();
  const closeMock = vi.fn();
  const startMock = vi.fn(async () => {});
  const registerMock = vi.fn(function register(next: Record<string, (data: unknown) => unknown>) {
    Object.assign(handlers, next);
    return this;
  });
  const reset = () => {
    for (const key of Object.keys(handlers)) {
      delete handlers[key];
    }
    readyState = 0;
    terminateMock.mockReset();
    reConnectMock.mockReset();
    closeMock.mockReset();
    startMock.mockReset();
    startMock.mockResolvedValue(undefined);
    registerMock.mockClear();
  };
  return {
    handlers,
    setReadyState: (next: number) => {
      readyState = next;
    },
    getWSInstance: () => ({ readyState, terminate: terminateMock }),
    terminateMock,
    reConnectMock,
    closeMock,
    startMock,
    registerMock,
    reset,
  };
});

const tempDirs: string[] = [];
const originalRelaydeskHome = process.env.RELAYDESK_HOME;

vi.mock("@larksuiteoapi/node-sdk", () => ({
  Client: class MockClient {},
  WSClient: class MockWSClient {
    wsConfig = { getWSInstance: mocks.getWSInstance };
    reConnect = mocks.reConnectMock;
    close = mocks.closeMock;

    async start(params: unknown) {
      return mocks.startMock(params);
    }
  },
  EventDispatcher: class MockEventDispatcher {
    register = mocks.registerMock;
  },
  LoggerLevel: {
    info: "info",
  },
}));

describe("Feishu client", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    mocks.reset();
    const dir = mkdtempSync(join(tmpdir(), "relaydesk-feishu-dedupe-"));
    tempDirs.push(dir);
    process.env.RELAYDESK_HOME = dir;
  });

  afterEach(async () => {
    const { stopFeishu } = await import("./client.js");
    stopFeishu();
    process.env.RELAYDESK_HOME = originalRelaydeskHome;
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
    vi.useRealTimers();
  });

  it("drops duplicate inbound message events before they reach the handler", async () => {
    const eventHandler = vi.fn(async () => {});
    const { initFeishu } = await import("./client.js");

    await initFeishu(
      {
        feishuAppId: "cli_app",
        feishuAppSecret: "secret",
      } as never,
      eventHandler,
    );

    const event = {
      event: {
        message: {
          message_id: "msg-1",
          create_time: String(Date.now()),
        },
      },
    };

    await mocks.handlers["im.message.receive_v1"](event);
    await mocks.handlers["im.message.receive_v1"](event);

    expect(eventHandler).toHaveBeenCalledTimes(1);
    expect(eventHandler).toHaveBeenCalledWith(event);
  });

  it("drops stale inbound message events before they reach the handler", async () => {
    const eventHandler = vi.fn(async () => {});
    const { initFeishu } = await import("./client.js");

    await initFeishu(
      {
        feishuAppId: "cli_app",
        feishuAppSecret: "secret",
      } as never,
      eventHandler,
    );

    await mocks.handlers["im.message.receive_v1"]({
      event: {
        message: {
          message_id: "msg-old",
          create_time: String(Date.now() - 31 * 60 * 1000),
        },
      },
    });

    expect(eventHandler).not.toHaveBeenCalled();
  });

  it("forces reconnect when the Feishu websocket stalls past the grace window", async () => {
    const { initFeishu } = await import("./client.js");

    await initFeishu(
      {
        feishuAppId: "cli_app",
        feishuAppSecret: "secret",
      } as never,
      async () => {},
    );

    vi.advanceTimersByTime(40_000);

    expect(mocks.reConnectMock).toHaveBeenCalledWith(true);
  });

  it("persists recent message ids so restart-surviving duplicates are still suppressed", async () => {
    const firstHandler = vi.fn(async () => {});
    const { initFeishu, stopFeishu } = await import("./client.js");

    await initFeishu(
      {
        feishuAppId: "cli_app",
        feishuAppSecret: "secret",
      } as never,
      firstHandler,
    );

    const event = {
      event: {
        message: {
          message_id: "msg-persisted",
          create_time: String(Date.now()),
        },
      },
    };

    await mocks.handlers["im.message.receive_v1"](event);
    stopFeishu();

    vi.resetModules();
    mocks.reset();

    const secondHandler = vi.fn(async () => {});
    const restartedClient = await import("./client.js");
    await restartedClient.initFeishu(
      {
        feishuAppId: "cli_app",
        feishuAppSecret: "secret",
      } as never,
      secondHandler,
    );

    await mocks.handlers["im.message.receive_v1"](event);

    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).not.toHaveBeenCalled();
  });
});
