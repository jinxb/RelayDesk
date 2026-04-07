import {
  createSdkMcpServer,
  tool,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const CURRENT_MEDIA_SERVER_NAME = "relaydesk-current-media";
const CURRENT_MEDIA_TOOL_NAME = "relaydesk_send_current_media";
const CURRENT_MEDIA_INPUT_SCHEMA = {
  kind: z.enum(["image", "file"]),
  filePath: z.string().trim().min(1),
};

interface CurrentTaskMediaToolInput {
  readonly port: number;
  readonly token: string;
}

interface CurrentTaskMediaReceipt {
  readonly ok: true;
  readonly channel: string;
  readonly chatId: string;
  readonly kind: "image" | "file";
  readonly filePath: string;
}

function currentTaskMediaEndpoint(port: number) {
  return `http://127.0.0.1:${port}/v1/media/send-current`;
}

function buildToolResultText(receipt: CurrentTaskMediaReceipt) {
  const kindLabel = receipt.kind === "image" ? "图片" : "文件";
  return `已发送${kindLabel}到当前聊天：${receipt.filePath}`;
}

function textToolResult(text: string): CallToolResult {
  return {
    content: [{ type: "text", text }],
  };
}

export async function invokeCurrentTaskMediaHook(
  input: CurrentTaskMediaToolInput & {
    readonly kind: "image" | "file";
    readonly filePath: string;
  },
): Promise<CurrentTaskMediaReceipt> {
  const response = await fetch(currentTaskMediaEndpoint(input.port), {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      kind: input.kind,
      filePath: input.filePath,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & Partial<CurrentTaskMediaReceipt>;

  if (!response.ok) {
    throw new Error(payload.error ?? `Current-task media hook failed: HTTP ${response.status}`);
  }

  if (
    payload.ok !== true ||
    typeof payload.channel !== "string" ||
    typeof payload.chatId !== "string" ||
    (payload.kind !== "image" && payload.kind !== "file") ||
    typeof payload.filePath !== "string"
  ) {
    throw new Error("Current-task media hook returned an invalid success payload.");
  }

  return payload as CurrentTaskMediaReceipt;
}

export function createCurrentTaskMediaSdkServer(
  input: CurrentTaskMediaToolInput,
): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: CURRENT_MEDIA_SERVER_NAME,
    version: "1.0.0",
    tools: [
      tool(
        CURRENT_MEDIA_TOOL_NAME,
        "把当前任务里的本地图片或文件发回当前聊天。仅可发送当前任务上下文中的本地绝对路径文件。",
        CURRENT_MEDIA_INPUT_SCHEMA,
        async (args) => {
          const receipt = await invokeCurrentTaskMediaHook({
            port: input.port,
            token: input.token,
            kind: args.kind,
            filePath: args.filePath,
          });
          return textToolResult(buildToolResultText(receipt));
        },
      ),
    ],
  });
}

export { CURRENT_MEDIA_SERVER_NAME, CURRENT_MEDIA_TOOL_NAME };
