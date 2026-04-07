export type ContinuityToolId = "claude" | "codex" | "codebuddy";

export interface StoredConversationTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly createdAt: number;
}

export type ContinuityMode = "native" | "relay" | "fresh";

export function resolveContinuityMode(
  sessionId: string | undefined,
  turns: readonly StoredConversationTurn[],
): ContinuityMode {
  if (sessionId) return "native";
  return turns.length > 0 ? "relay" : "fresh";
}

export function continuityModeLabel(mode: ContinuityMode): string {
  if (mode === "native") return "原生续接";
  if (mode === "relay") return "RelayDesk 续接";
  return "全新上下文";
}

function formatTurn(turn: StoredConversationTurn, index: number): string {
  const role = turn.role === "user" ? "用户" : "助手";
  return `${index + 1}. ${role}：\n${turn.content}`;
}

export function buildContinuityPrompt(input: {
  readonly prompt: string;
  readonly turns: readonly StoredConversationTurn[];
  readonly toolId: ContinuityToolId;
}): string {
  if (input.turns.length === 0) {
    return input.prompt;
  }

  return [
    "【RelayDesk 上下文续接】",
    `当前 ${input.toolId} 原生会话不可用，但本聊天最近的对话记录仍然有效。`,
    "请基于以下最近对话继续协作，不要要求用户重复已经提供过的上下文。",
    "",
    "最近对话：",
    ...input.turns.map(formatTurn),
    "",
    "当前用户消息：",
    input.prompt,
  ].join("\n");
}
