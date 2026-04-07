import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSdkMcpServerMock, toolMock } = vi.hoisted(() => ({
  createSdkMcpServerMock: vi.fn(),
  toolMock: vi.fn(),
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  createSdkMcpServer: createSdkMcpServerMock,
  tool: toolMock,
}));

import {
  createCurrentTaskMediaSdkServer,
  CURRENT_MEDIA_SERVER_NAME,
  CURRENT_MEDIA_TOOL_NAME,
  invokeCurrentTaskMediaHook,
} from "./current-task-media-mcp.js";

describe("current-task-media-mcp", () => {
  beforeEach(() => {
    createSdkMcpServerMock.mockReset();
    toolMock.mockReset();
    createSdkMcpServerMock.mockImplementation((options) => ({
      instance: {},
      transport: "sdk",
      ...options,
    }));
    toolMock.mockImplementation((name, description, inputSchema, handler) => ({
      name,
      description,
      inputSchema,
      handler,
    }));
  });

  it("wraps the current-task media hook as an SDK MCP tool", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          channel: "telegram",
          chatId: "chat-1",
          kind: "image",
          filePath: "/tmp/out.png",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const server = createCurrentTaskMediaSdkServer({
      port: 40123,
      token: "token-123",
    });

    expect(createSdkMcpServerMock).toHaveBeenCalledTimes(1);
    const createOptions = createSdkMcpServerMock.mock.calls[0]?.[0] as {
      name: string;
      tools: Array<{ name: string; handler: (args: { kind: "image" | "file"; filePath: string }) => Promise<unknown> }>;
    };
    expect(createOptions.name).toBe(CURRENT_MEDIA_SERVER_NAME);
    expect(createOptions.tools).toHaveLength(1);
    expect(createOptions.tools[0]?.name).toBe(CURRENT_MEDIA_TOOL_NAME);
    expect(server.name).toBe(CURRENT_MEDIA_SERVER_NAME);

    await expect(
      createOptions.tools[0]?.handler({
        kind: "image",
        filePath: "/tmp/out.png",
      }),
    ).resolves.toEqual({
      content: [{ type: "text", text: "已发送图片到当前聊天：/tmp/out.png" }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:40123/v1/media/send-current",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer token-123",
          "content-type": "application/json",
        }),
      }),
    );
  });

  it("surfaces current-task media hook failures", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: "send failed" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      invokeCurrentTaskMediaHook({
        port: 40123,
        token: "token-123",
        kind: "file",
        filePath: "/tmp/report.txt",
      }),
    ).rejects.toThrow("send failed");
  });
});
