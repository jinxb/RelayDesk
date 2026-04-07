import type { Platform } from "../../../state/src/index.js";

export type CurrentTaskMediaKind = "image" | "file";

export interface CurrentTaskMediaTarget {
  readonly taskKey: string;
  readonly platform: Platform;
  readonly chatId: string;
}

export interface CurrentTaskMediaHookRegistration {
  readonly endpoint: string;
  readonly token: string;
  readonly port: number;
  revoke(): void;
}

export interface CurrentTaskMediaHook {
  registerCurrentTaskMediaTarget(
    target: CurrentTaskMediaTarget,
  ): CurrentTaskMediaHookRegistration;
}

export function supportsCurrentTaskMediaTool(platform: Platform): boolean {
  return platform !== "wework";
}

export function shouldInjectCurrentTaskMediaPrompt(
  platform: Platform,
  aiCommand: string,
): boolean {
  return supportsCurrentTaskMediaTool(platform) && aiCommand !== "claude";
}

export function buildCurrentTaskMediaPrompt(input: {
  readonly prompt: string;
  readonly endpoint: string;
  readonly token: string;
}): string {
  return [
    "【RelayDesk 当前会话附件发送】",
    "如果用户明确要求把本地图片或文件直接发回当前聊天，可调用本地 HTTP 工具。",
    `POST ${input.endpoint}`,
    `Authorization: Bearer ${input.token}`,
    'JSON: {"kind":"image"|"file","filePath":"/absolute/path/to/file"}',
    "只发送当前任务上下文中的本地绝对路径文件；如果接口报错，必须直接告诉用户失败原因，不要假装已发送。",
    "",
    input.prompt,
  ].join("\n");
}
