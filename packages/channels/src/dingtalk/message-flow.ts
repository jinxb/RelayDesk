import {
  createAndDeliverCard,
  finishStreamingCard,
  prepareStreamingCard,
  sendRobotInteractiveCard,
  sendText,
  updateCardInstance,
  updateRobotInteractiveCard,
  updateStreamingCard,
} from "./client.js";
import type { DingTalkStreamingTarget } from "./client.js";
import {
  buildDingTalkCardData,
  type MessageStatus,
} from "./message-format.js";
import {
  getCardTemplateId,
  getRobotCodeFallback,
  getStreamState,
  setStreamState,
} from "./message-state.js";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function effectiveTarget(
  chatId: string,
  target: DingTalkStreamingTarget | undefined,
  robotCode: string,
): DingTalkStreamingTarget {
  if (!target) {
    return { chatId, robotCode };
  }
  return { ...target, robotCode };
}

export async function sendTextWithRetry(
  chatId: string,
  text: string,
  log: { warn: (msg: string, ...args: unknown[]) => void },
  retries = 1,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await sendText(chatId, text);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        log.warn(`DingTalk send failed, retrying (${attempt + 1}/${retries}):`, error);
        await wait(300);
      }
    }
  }
  throw lastError;
}

export async function initializeDingTalkStream(
  options: {
    chatId: string;
    messageId: string;
    toolId: string;
    target?: DingTalkStreamingTarget;
  },
  log: { debug: (msg: string, ...args: unknown[]) => void; info: (msg: string) => void },
) {
  const templateId = getCardTemplateId();
  const robotCode = options.target?.robotCode || getRobotCodeFallback();

  if (robotCode) {
    try {
      const target = effectiveTarget(options.chatId, options.target, robotCode);
      await sendRobotInteractiveCard(
        target,
        options.messageId,
        buildDingTalkCardData("", "thinking", "请稍候", options.toolId),
      );
      setStreamState(options.messageId, {
        chatId: options.chatId,
        mode: "interactiveCard",
        cardBizId: options.messageId,
        toolId: options.toolId,
        target: options.target,
      });
      return;
    } catch (error) {
      log.debug("DingTalk interactive card failed, trying other transports:", error);
    }
  }

  if (templateId) {
    try {
      const conversationToken = await prepareStreamingCard(
        options.target ?? options.chatId,
        templateId,
        buildDingTalkCardData("", "thinking", "请稍候", options.toolId),
      );
      setStreamState(options.messageId, {
        chatId: options.chatId,
        mode: "card",
        conversationToken,
        toolId: options.toolId,
        target: options.target,
      });
      return;
    } catch (prepareError) {
      log.debug("DingTalk prepare failed, trying createAndDeliver:", prepareError);
      if (robotCode) {
        try {
          const target = effectiveTarget(options.chatId, options.target, robotCode);
          await createAndDeliverCard(
            target,
            templateId,
            options.messageId,
            buildDingTalkCardData("", "thinking", "请稍候", options.toolId),
          );
          setStreamState(options.messageId, {
            chatId: options.chatId,
            mode: "cardInstance",
            outTrackId: options.messageId,
            toolId: options.toolId,
            target: options.target,
          });
          return;
        } catch (cardError) {
          log.debug("DingTalk createAndDeliver failed:", cardError);
        }
      }
    }
  }

  setStreamState(options.messageId, {
    chatId: options.chatId,
    mode: "text",
    toolId: options.toolId,
    target: options.target,
  });
  log.info("DingTalk 流式卡片不可用，将使用普通文本回复");
}

export async function updateDingTalkStream(
  messageId: string,
  content: string,
  status: MessageStatus,
  note: string | undefined,
  toolId: string,
  log: { warn: (msg: string, ...args: unknown[]) => void },
) {
  const state = getStreamState(messageId);
  if (!state) return;

  if (state.mode === "card" && state.conversationToken) {
    const templateId = getCardTemplateId();
    if (!templateId) return;
    try {
      await updateStreamingCard(
        state.conversationToken,
        templateId,
        buildDingTalkCardData(content, status, note, toolId),
      );
    } catch (error) {
      log.warn("Failed to update DingTalk streaming card:", error);
    }
    return;
  }

  if (state.mode === "cardInstance" && state.outTrackId) {
    try {
      await updateCardInstance(
        state.outTrackId,
        buildDingTalkCardData(content, status, note, toolId),
      );
    } catch (error) {
      log.warn("Failed to update DingTalk card instance:", error);
    }
    return;
  }

  if (state.mode === "interactiveCard" && state.cardBizId) {
    try {
      await updateRobotInteractiveCard(
        state.cardBizId,
        buildDingTalkCardData(content, status, note, toolId),
      );
    } catch (error) {
      log.warn("Failed to update DingTalk interactive card:", error);
    }
  }
}

export async function finishDingTalkCard(
  conversationToken: string | undefined,
  log: { warn: (msg: string, ...args: unknown[]) => void },
) {
  if (!conversationToken) return;
  try {
    await finishStreamingCard(conversationToken);
  } catch (error) {
    log.warn("Failed to finish DingTalk streaming card:", error);
  }
}
