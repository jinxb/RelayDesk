import {
  buildCompletionSummary,
  buildMessageTitle,
  buildTextNote,
} from "../../../interaction/src/index.js";

export type MessageStatus = "thinking" | "streaming" | "done" | "error";

const STATUS_CONFIG: Record<MessageStatus, { icon: string; title: string }> = {
  thinking: { icon: "[thinking]", title: "思考中" },
  streaming: { icon: "[streaming]", title: "输出中" },
  done: { icon: "[done]", title: "完成" },
  error: { icon: "[error]", title: "错误" },
};

export function getWeWorkToolTitle(toolId: string, status: MessageStatus) {
  return buildMessageTitle(toolId, status, {
    statusTitles: {
      thinking: STATUS_CONFIG.thinking.title,
      streaming: STATUS_CONFIG.streaming.title,
      done: STATUS_CONFIG.done.title,
      error: STATUS_CONFIG.error.title,
    },
  });
}

export function formatWeWorkNote(note: string): string {
  const trimmedNote = note.trim();
  const lines = trimmedNote.split("\n").map((line) => line.trim()).filter(Boolean);

  if (lines.length === 0) return buildTextNote(trimmedNote);

  const formattedLines = lines.flatMap((line) => {
    if (line.startsWith("输出中")) return ["💡 输出中..."];

    const bashIndex = line.indexOf("Bash");
    if (bashIndex >= 0) {
      const command = line
        .slice(bashIndex + "Bash".length)
        .replace(/^[\s:：\-–—>→]+/, "")
        .trim();
      return command ? ["🔧 Bash", "```", command, "```"] : ["🔧 Bash"];
    }

    const readIndex = line.indexOf("Read");
    if (readIndex >= 0) {
      const path = line
        .slice(readIndex + "Read".length)
        .replace(/^[\s:：\-–—>→]+/, "")
        .trim();
      return path ? [`📖 Read \`${path.replace(/`/g, "\\`")}\``] : ["📖 Read"];
    }

    const writeIndex = line.indexOf("Write");
    if (writeIndex >= 0) {
      const path = line
        .slice(writeIndex + "Write".length)
        .replace(/^[\s:：\-–—>→]+/, "")
        .trim();
      return path ? [`✏️ Write \`${path.replace(/`/g, "\\`")}\``] : ["✏️ Write"];
    }

    return [line];
  });

  return `─────────\n\n${formattedLines.join("\n")}`;
}

export function formatWeWorkMessage(
  title: string,
  content: string,
  status: MessageStatus,
  note?: string,
  toolId?: string,
) {
  if (status === "done" && toolId) {
    const trimmedContent = content.trim();
    const summary = buildCompletionSummary(toolId, note);
    return summary
      ? `${trimmedContent}\n\n${buildTextNote(summary)}`
      : trimmedContent;
  }

  const statusConfig = STATUS_CONFIG[status];
  let message = `${statusConfig.icon} **${title}**\n\n`;

  if (content) {
    message += `${content}\n\n`;
  } else if (status === "thinking") {
    message += `_正在思考，请稍候..._\n\n[thinking] **准备中**\n\n`;
  }

  if (note) {
    message += formatWeWorkNote(note);
  }

  return message;
}
