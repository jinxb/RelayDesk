import { afterEach, describe, expect, it, vi } from "vitest";

const {
  createServerMock,
  deliverMediaToCurrentTaskTargetMock,
  serverState,
} = vi.hoisted(() => ({
  createServerMock: vi.fn(),
  deliverMediaToCurrentTaskTargetMock: vi.fn(),
  serverState: {
    handler: null as ((request: any, response: any) => void | Promise<void>) | null,
  },
}));

vi.mock("node:http", () => ({
  createServer: createServerMock,
}));

vi.mock("./runtime-media-delivery.js", () => ({
  deliverMediaToCurrentTaskTarget: deliverMediaToCurrentTaskTargetMock,
}));

createServerMock.mockImplementation((handler: (request: any, response: any) => void | Promise<void>) => {
  serverState.handler = handler;
  let errorHandler: ((error: unknown) => void) | null = null;

  return {
    listen(_port: number, _host: string, callback: () => void) {
      callback();
      return this;
    },
    on(event: string, callback: (error: unknown) => void) {
      if (event === "error") {
        errorHandler = callback;
      }
      return this;
    },
    address() {
      return { port: 44950 };
    },
    close(callback?: (error?: Error | null) => void) {
      callback?.(null);
    },
    __emitError(error: unknown) {
      errorHandler?.(error);
    },
  };
});

import { startRuntimeMediaHookServer } from "./runtime-media-hook.js";

let closeServer: (() => Promise<void>) | null = null;
const originalFetch = global.fetch;

function createMockResponse() {
  let statusCode = 200;
  let payload = "";

  return {
    response: {
      writeHead(nextStatusCode: number) {
        statusCode = nextStatusCode;
      },
      end(body: string) {
        payload = body;
      },
    },
    toResponse() {
      return new Response(payload, {
        status: statusCode,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    },
  };
}

async function dispatchMockFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!serverState.handler) {
    throw new Error("Mock HTTP server handler is not initialized.");
  }

  const bodyText = typeof init?.body === "string" ? init.body : "";
  const headers = new Headers(init?.headers);
  const url = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  const parsedUrl = new URL(url);

  const request = {
    method: init?.method ?? "GET",
    url: parsedUrl.pathname,
    headers: Object.fromEntries(headers.entries()),
    async *[Symbol.asyncIterator]() {
      if (bodyText) {
        yield Buffer.from(bodyText);
      }
    },
  };

  const mockResponse = createMockResponse();
  await serverState.handler(request, mockResponse.response);
  return mockResponse.toResponse();
}

afterEach(async () => {
  if (closeServer) {
    await closeServer();
    closeServer = null;
  }
  global.fetch = originalFetch;
  deliverMediaToCurrentTaskTargetMock.mockReset();
  serverState.handler = null;
});

describe("startRuntimeMediaHookServer", () => {
  it("rejects unauthorized requests", async () => {
    global.fetch = dispatchMockFetch as typeof fetch;

    const server = await startRuntimeMediaHookServer();
    closeServer = () => server.close();

    const response = await fetch(`http://127.0.0.1:${server.port}/v1/media/send-current`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "image", filePath: "/tmp/out.png" }),
    });

    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized media hook token.",
    });
    expect(response.status).toBe(401);
  });

  it("routes valid requests to the registered current task target", async () => {
    global.fetch = dispatchMockFetch as typeof fetch;
    deliverMediaToCurrentTaskTargetMock.mockResolvedValue({
      ok: true,
      channel: "telegram",
      chatId: "chat-1",
      kind: "image",
      filePath: "/tmp/out.png",
    });

    const server = await startRuntimeMediaHookServer();
    closeServer = () => server.close();
    const registration = server.registerCurrentTaskMediaTarget({
      taskKey: "task-1",
      platform: "telegram",
      chatId: "chat-1",
    });

    const response = await fetch(registration.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${registration.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ kind: "image", filePath: "/tmp/out.png" }),
    });

    await expect(response.json()).resolves.toEqual({
      ok: true,
      channel: "telegram",
      chatId: "chat-1",
      kind: "image",
      filePath: "/tmp/out.png",
    });
    expect(deliverMediaToCurrentTaskTargetMock).toHaveBeenCalledWith(
      { taskKey: "task-1", platform: "telegram", chatId: "chat-1" },
      { kind: "image", filePath: "/tmp/out.png" },
    );
  });

  it("invalidates tokens after revoke", async () => {
    global.fetch = dispatchMockFetch as typeof fetch;

    const server = await startRuntimeMediaHookServer();
    closeServer = () => server.close();
    const registration = server.registerCurrentTaskMediaTarget({
      taskKey: "task-2",
      platform: "telegram",
      chatId: "chat-2",
    });
    registration.revoke();

    const response = await fetch(registration.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${registration.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ kind: "file", filePath: "/tmp/report.txt" }),
    });

    expect(response.status).toBe(401);
  });
});
