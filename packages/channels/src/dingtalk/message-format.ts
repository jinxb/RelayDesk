import {
  buildMessageTitle,
  buildTextNote,
  getAIToolDisplayName,
} from "../../../interaction/src/index.js";

export type MessageStatus = "thinking" | "streaming" | "done" | "error";

const STATUS_ICONS: Record<MessageStatus, string> = {
  thinking: "🔵",
  streaming: "🔄",
  done: "✅",
  error: "❌",
};

export const FLOW_STATUS: Record<MessageStatus, number> = {
  thinking: 1,
  streaming: 2,
  done: 3,
  error: 5,
};

export function formatDingTalkMessage(
  content: string,
  status: MessageStatus,
  note?: string,
  toolId = "claude",
) {
  const icon = STATUS_ICONS[status];
  const toolName = getAIToolDisplayName(toolId);
  const title =
    status === "thinking"
      ? `${toolName} - 思考中`
      : status === "streaming"
        ? `${toolName} - 执行中`
        : status === "error"
          ? `${toolName} - 错误`
          : toolName;

  let text = `${icon} ${title}\n\n${content}`;
  if (note) {
    text += `\n\n${buildTextNote(note)}`;
  }
  return text;
}

export function getDingTalkToolTitle(toolId: string, status: MessageStatus) {
  return buildMessageTitle(toolId, status);
}

export function buildDingTalkCardData(
  content: string,
  status: MessageStatus,
  note?: string,
  toolId = "claude",
): Record<string, unknown> {
  const toolName = getAIToolDisplayName(toolId);
  const safeContent =
    content.trim() ||
    (status === "thinking"
      ? "正在思考，请稍候..."
      : status === "error"
        ? "执行失败"
        : "...");
  const safeNote = note?.trim() || "";
  const lastMessage =
    safeContent.length > 50
      ? `${safeContent.slice(0, 47)}...`
      : safeContent || getDingTalkToolTitle(toolId, status);

  const resources: Array<{ title: string }> = [];
  if (safeNote) {
    for (const line of safeNote.split("\n")) {
      const title = line.replace(/^\d+\.\s*/, "").trim();
      if (title) {
        resources.push({ title });
      }
    }
    if (resources.length === 0) {
      resources.push({ title: safeNote });
    }
  }

  return {
    lastMessage,
    content: safeContent,
    resources,
    users: [] as unknown[],
    flowStatus: FLOW_STATUS[status],
    note: safeNote,
    status,
    toolName,
    title: getDingTalkToolTitle(toolId, status),
    displayText: formatDingTalkMessage(safeContent, status, safeNote, toolId),
  };
}
