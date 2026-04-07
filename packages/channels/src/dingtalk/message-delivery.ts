import {
  updateCardInstance,
  updateRobotInteractiveCard,
  updateStreamingCard,
} from "./client.js";
import {
  buildDingTalkCardData,
  formatDingTalkMessage,
} from "./message-format.js";
import {
  deleteStreamState,
  getCardTemplateId,
  getStreamState,
} from "./message-state.js";
import {
  finishDingTalkCard,
  sendTextWithRetry,
} from "./message-flow.js";

export async function finalizeDingTalkStream(
  options: {
    chatId: string;
    messageId: string;
    fullContent: string;
    note: string;
    toolId: string;
    maxLength: number;
  },
  log: {
    warn: (msg: string, ...args: unknown[]) => void;
  },
) {
  const { splitLongContent } = await import("../../../interaction/src/index.js");
  const parts = splitLongContent(options.fullContent, options.maxLength);
  const templateId = getCardTemplateId();
  const state = getStreamState(options.messageId);

  const sendRemainingTextParts = async () => {
    for (let index = 1; index < parts.length; index += 1) {
      const partNote =
        index === parts.length - 1 ? options.note : `继续输出 (${index + 1}/${parts.length})`;
      await sendTextWithRetry(
        options.chatId,
        formatDingTalkMessage(parts[index], "done", partNote, options.toolId),
        log,
      );
    }
  };

  if (templateId && state?.mode === "card" && state.conversationToken) {
    let updatedCard = false;
    try {
      const cardNote =
        parts.length > 1 ? `内容较长，后续将继续发送 (${1}/${parts.length})` : options.note;
      await updateStreamingCard(
        state.conversationToken,
        templateId,
        buildDingTalkCardData(parts[0], "done", cardNote, options.toolId),
      );
      updatedCard = true;
      await finishDingTalkCard(state.conversationToken, log);
      deleteStreamState(options.messageId);
      await sendRemainingTextParts();
      return;
    } catch (error) {
      if (updatedCard) {
        deleteStreamState(options.messageId);
        log.warn("Final DingTalk card update already succeeded; skip text fallback:", error);
        return;
      }
      log.warn("Failed to finalize DingTalk streaming card, falling back to text:", error);
      await finishDingTalkCard(state.conversationToken, log);
    }
  }

  if (templateId && state?.mode === "cardInstance" && state.outTrackId) {
    try {
      const cardNote =
        parts.length > 1 ? `内容较长，后续将继续发送 (${1}/${parts.length})` : options.note;
      await updateCardInstance(
        state.outTrackId,
        buildDingTalkCardData(parts[0], "done", cardNote, options.toolId),
      );
      deleteStreamState(options.messageId);
      await sendRemainingTextParts();
      return;
    } catch (error) {
      log.warn("Failed to finalize DingTalk card instance, falling back to text:", error);
    }
  }

  if (state?.mode === "interactiveCard" && state.cardBizId) {
    try {
      const cardNote =
        parts.length > 1 ? `内容较长，后续将继续发送 (${1}/${parts.length})` : options.note;
      await updateRobotInteractiveCard(
        state.cardBizId,
        buildDingTalkCardData(parts[0], "done", cardNote, options.toolId),
      );
      deleteStreamState(options.messageId);
      await sendRemainingTextParts();
      return;
    } catch (error) {
      log.warn("Failed to finalize DingTalk interactive card, falling back to text:", error);
    }
  }

  deleteStreamState(options.messageId);
  for (let index = 0; index < parts.length; index += 1) {
    const partNote =
      parts.length > 1
        ? `${index === parts.length - 1 ? `${options.note}\n` : ""}(续 ${index + 1}/${parts.length})`.trim()
        : options.note;
    await sendTextWithRetry(
      options.chatId,
      formatDingTalkMessage(parts[index], "done", partNote, options.toolId),
      log,
    );
  }
}

export async function failDingTalkStream(
  options: {
    chatId: string;
    messageId: string;
    error: string;
    toolId: string;
  },
  log: { warn: (msg: string, ...args: unknown[]) => void },
) {
  const templateId = getCardTemplateId();
  const state = getStreamState(options.messageId);

  if (templateId && state?.mode === "card" && state.conversationToken) {
    let updatedCard = false;
    try {
      await updateStreamingCard(
        state.conversationToken,
        templateId,
        buildDingTalkCardData(`错误：${options.error}`, "error", "执行失败", options.toolId),
      );
      updatedCard = true;
      await finishDingTalkCard(state.conversationToken, log);
      deleteStreamState(options.messageId);
      return;
    } catch (error) {
      if (updatedCard) {
        deleteStreamState(options.messageId);
        log.warn("DingTalk error card update already succeeded; skip text fallback:", error);
        return;
      }
      log.warn("Failed to send DingTalk error card, falling back to text:", error);
      await finishDingTalkCard(state.conversationToken, log);
    }
  }

  if (templateId && state?.mode === "cardInstance" && state.outTrackId) {
    try {
      await updateCardInstance(
        state.outTrackId,
        buildDingTalkCardData(`错误：${options.error}`, "error", "执行失败", options.toolId),
      );
      deleteStreamState(options.messageId);
      return;
    } catch (error) {
      log.warn("Failed to update DingTalk error card instance, falling back to text:", error);
    }
  }

  if (state?.mode === "interactiveCard" && state.cardBizId) {
    try {
      await updateRobotInteractiveCard(
        state.cardBizId,
        buildDingTalkCardData(`错误：${options.error}`, "error", "执行失败", options.toolId),
      );
      deleteStreamState(options.messageId);
      return;
    } catch (error) {
      log.warn("Failed to update DingTalk error interactive card, falling back to text:", error);
    }
  }

  deleteStreamState(options.messageId);
  await sendTextWithRetry(
    options.chatId,
    formatDingTalkMessage(`错误：${options.error}`, "error", "执行失败", options.toolId),
    log,
  );
}
