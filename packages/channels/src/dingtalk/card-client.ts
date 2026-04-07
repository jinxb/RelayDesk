import type { DingTalkActiveTarget } from "../../../state/src/index.js";
import { buildDingTalkCardData } from "./message-format.js";
import {
  buildAiCardContent,
  buildCardParamMap,
  buildStandardCardData,
} from "./card-payload.js";
import {
  isGroupConversation,
  isSingleConversation,
} from "./proactive.js";

export interface DingTalkStreamingTarget {
  chatId: string;
  conversationType?: string;
  senderStaffId?: string;
  senderId?: string;
  robotCode?: string;
}

interface OpenApiDeps {
  callOpenApi: (path: string, body: Record<string, unknown>) => Promise<unknown>;
  callOpenApiWithMethod: (
    method: string,
    path: string,
    body: Record<string, unknown>,
  ) => Promise<unknown>;
  resolveUnionIdByUserId: (userId?: string) => Promise<string | undefined>;
  log: {
    debug: (msg: string, ...args: unknown[]) => void;
    warn: (msg: string, ...args: unknown[]) => void;
  };
}

export async function prepareStreamingCardRequest(
  deps: OpenApiDeps,
  target: string | DingTalkStreamingTarget,
  templateId: string,
  cardData: Record<string, unknown>,
) {
  const normalized = typeof target === "string" ? { chatId: target } : target;
  const content = buildAiCardContent(templateId, cardData);
  const attempts: Array<{ label: string; body: Record<string, unknown> }> = [];

  deps.log.debug(
    `DingTalk prepare: conversationType=${normalized.conversationType ?? "undefined"}, senderStaffId=${normalized.senderStaffId ?? "undefined"}`,
  );

  if (isSingleConversation(normalized.conversationType)) {
    const unionId = await deps.resolveUnionIdByUserId(normalized.senderStaffId).catch((error) => {
      deps.log.debug("Failed to resolve DingTalk unionId from senderStaffId:", error);
      return undefined;
    });

    if (unionId) {
      attempts.push({ label: "single-unionid", body: { unionId, contentType: "ai_card", content } });
    }
    if (normalized.chatId) {
      attempts.push({
        label: "single-chatid",
        body: { openConversationId: normalized.chatId, contentType: "ai_card", content },
      });
    }
  } else if (isGroupConversation(normalized.conversationType)) {
    const unionId = await deps.resolveUnionIdByUserId(normalized.senderStaffId).catch((error) => {
      deps.log.debug("Failed to resolve DingTalk unionId for group (fallback):", error);
      return undefined;
    });
    if (unionId) {
      attempts.push({ label: "group-unionid", body: { unionId, contentType: "ai_card", content } });
    }
    if (normalized.chatId) {
      attempts.push({
        label: "group-chatid",
        body: { openConversationId: normalized.chatId, contentType: "ai_card", content },
      });
    }
  } else {
    const unionId = await deps.resolveUnionIdByUserId(normalized.senderStaffId).catch((error) => {
      deps.log.debug("Failed to resolve DingTalk unionId for unknown conversation type:", error);
      return undefined;
    });
    if (unionId) {
      attempts.push({ label: "unknown-unionid", body: { unionId, contentType: "ai_card", content } });
    }
    if (normalized.chatId) {
      attempts.push({
        label: "unknown-chatid",
        body: { openConversationId: normalized.chatId, contentType: "ai_card", content },
      });
    }
  }

  if (attempts.length === 0) {
    throw new Error("DingTalk prepare target is incomplete");
  }

  let result: Record<string, unknown> | undefined;
  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      result = await deps.callOpenApi("/v1.0/aiInteraction/prepare", attempt.body) as Record<string, unknown>;
      break;
    } catch (error) {
      lastError = error;
      deps.log.debug(`DingTalk prepare attempt failed (${attempt.label}):`, error);
    }
  }

  if (!result) {
    throw lastError instanceof Error ? lastError : new Error("DingTalk prepare failed");
  }

  const token = (result.result as Record<string, unknown> | undefined)?.conversationToken;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error(`DingTalk prepare did not return conversationToken: ${JSON.stringify(result)}`);
  }
  return token;
}

export async function updateStreamingCardRequest(
  deps: OpenApiDeps,
  conversationToken: string,
  templateId: string,
  cardData: Record<string, unknown>,
) {
  const result = await deps.callOpenApi("/v1.0/aiInteraction/update", {
    conversationToken,
    contentType: "ai_card",
    content: buildAiCardContent(templateId, cardData),
  }) as Record<string, unknown>;
  const success = (result.result as Record<string, unknown> | undefined)?.success;
  if (success === false) {
    throw new Error(`DingTalk update returned success=false: ${JSON.stringify(result)}`);
  }
}

export async function finishStreamingCardRequest(
  deps: OpenApiDeps,
  conversationToken: string,
) {
  const result = await deps.callOpenApi("/v1.0/aiInteraction/finish", {
    conversationToken,
  }) as Record<string, unknown>;
  const success = (result.result as Record<string, unknown> | undefined)?.success;
  if (success === false) {
    throw new Error(`DingTalk finish returned success=false: ${JSON.stringify(result)}`);
  }
}

export async function createAndDeliverCardRequest(
  deps: OpenApiDeps,
  target: DingTalkStreamingTarget,
  templateId: string,
  outTrackId: string,
  cardData: Record<string, unknown>,
) {
  if (!target.robotCode) {
    throw new Error("DingTalk robotCode required for createAndDeliver");
  }

  const isSingle = isSingleConversation(target.conversationType);
  const cardParamMap = buildCardParamMap(cardData);
  if (!cardParamMap.content && !cardParamMap.lastMessage) cardParamMap.content = "...";
  const lastMsg = String(cardData.lastMessage ?? cardData.displayText ?? cardData.content ?? cardData.title ?? "AI").slice(0, 50);

  const body: Record<string, unknown> = {
    userId: target.senderStaffId ?? "system",
    cardTemplateId: templateId,
    outTrackId,
    cardData: { cardParamMap },
  };

  if (isSingle && target.senderStaffId) {
    body.openSpaceId = `dtv1.card//im_robot.${target.senderStaffId}`;
    body.imRobotOpenSpaceModel = {
      lastMessageI18n: { zh_CN: lastMsg },
      searchSupport: { searchIcon: "", searchTypeName: "消息", searchDesc: "" },
      notification: { alertContent: lastMsg },
    };
    body.imRobotOpenDeliverModel = { spaceType: "IM_ROBOT" };
  } else {
    body.openSpaceId = `dtv1.card//im_group.${target.chatId}`;
    body.imGroupOpenSpaceModel = {
      lastMessageI18n: { zh_CN: lastMsg },
      searchSupport: { searchIcon: "", searchTypeName: "消息", searchDesc: "" },
      notification: { alertContent: lastMsg },
    };
    body.imGroupOpenDeliverModel = {
      robotCode: target.robotCode,
      atUserIds: {},
      recipients: [],
    };
  }

  await deps.callOpenApiWithMethod("POST", "/v1.0/card/instances/createAndDeliver", body);
}

export async function updateCardInstanceRequest(
  deps: OpenApiDeps,
  outTrackId: string,
  cardData: Record<string, unknown>,
) {
  await deps.callOpenApiWithMethod("PUT", "/v1.0/card/instances", {
    outTrackId,
    cardData: { cardParamMap: buildCardParamMap(cardData) },
  });
}

export async function sendRobotInteractiveCardRequest(
  deps: OpenApiDeps,
  target: DingTalkStreamingTarget,
  cardBizId: string,
  cardData: Record<string, unknown>,
) {
  if (!target.robotCode) {
    throw new Error("DingTalk robotCode required for interactive card");
  }

  const body: Record<string, unknown> = {
    cardTemplateId: "StandardCard",
    cardBizId,
    outTrackId: cardBizId,
    robotCode: target.robotCode,
    cardData: buildStandardCardData(cardData),
  };

  if (isSingleConversation(target.conversationType) && target.senderStaffId) {
    body.singleChatReceiver = JSON.stringify({ userid: target.senderStaffId });
  } else {
    body.openConversationId = target.chatId;
  }

  deps.log.debug(
    `DingTalk sendRobotInteractiveCard: isSingle=${isSingleConversation(target.conversationType)}, robotCode=${target.robotCode?.slice(0, 8)}..., chatIdLen=${target.chatId?.length}`,
  );

  try {
    await deps.callOpenApiWithMethod("POST", "/v1.0/im/v1.0/robot/interactiveCards/send", body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("param.error") || message.includes("参数无效")) {
      deps.log.warn(
        "DingTalk robot interactive card param.error - request body (no secrets):",
        JSON.stringify({ ...body, robotCode: "[REDACTED]" }, null, 2),
      );
    }
    throw error;
  }
}

export async function updateRobotInteractiveCardRequest(
  deps: OpenApiDeps,
  cardBizId: string,
  cardData: Record<string, unknown>,
) {
  await deps.callOpenApiWithMethod("PUT", "/v1.0/im/robots/interactiveCards", {
    cardBizId,
    cardData: buildStandardCardData(cardData),
  });
}
