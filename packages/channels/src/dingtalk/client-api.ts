import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { DingTalkActiveTarget } from "../../../state/src/index.js";
import type { DingTalkStreamingTarget } from "./card-client.js";
import {
  buildMediaPayload,
  type DingTalkMediaType,
} from "./card-payload.js";
import {
  createAndDeliverCardRequest,
  finishStreamingCardRequest,
  prepareStreamingCardRequest,
  sendRobotInteractiveCardRequest,
  updateCardInstanceRequest,
  updateRobotInteractiveCardRequest,
  updateStreamingCardRequest,
} from "./card-client.js";
import {
  callOpenApi,
  callOpenApiWithMethod,
  callOapi,
  downloadRobotMessageFileWithAccessToken,
  sendByWebhook,
  type DingTalkDownloadedMessageFile,
  uploadRobotMediaWithAccessToken,
} from "./http.js";
import {
  buildProactiveAttempts,
  isGroupConversation,
  isSingleConversation,
  resolveUnionIdByUserId,
} from "./proactive.js";
import {
  getDingTalkAccessToken,
  getSessionWebhook,
  getUnionIdCache,
} from "./runtime.js";

type LoggerLike = {
  debug: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
};

type DingTalkMediaTarget = DingTalkActiveTarget | DingTalkStreamingTarget;

async function openApi(path: string, body: Record<string, unknown>) {
  return callOpenApi(await getDingTalkAccessToken(), path, body);
}

async function openApiWithMethod(
  method: string,
  path: string,
  body: Record<string, unknown>,
) {
  return callOpenApiWithMethod(await getDingTalkAccessToken(), method, path, body);
}

async function resolveUnionId(userId?: string) {
  return resolveUnionIdByUserId(userId, getUnionIdCache(), async (path, body) => {
    return callOapi(await getDingTalkAccessToken(), path, body);
  });
}

function cardDeps(log: LoggerLike) {
  return {
    callOpenApi: openApi,
    callOpenApiWithMethod: openApiWithMethod,
    resolveUnionIdByUserId: resolveUnionId,
    log,
  };
}

export async function sendDingTalkText(chatId: string, content: string) {
  const sessionWebhook = getSessionWebhook(chatId);
  if (!sessionWebhook) {
    throw new Error(`DingTalk sessionWebhook unavailable for chat ${chatId}`);
  }
  return sendByWebhook(sessionWebhook, await getDingTalkAccessToken(), {
    msgtype: "text",
    text: { content },
  });
}

export async function sendDingTalkMarkdown(
  chatId: string,
  title: string,
  text: string,
) {
  const sessionWebhook = getSessionWebhook(chatId);
  if (!sessionWebhook) {
    throw new Error(`DingTalk sessionWebhook unavailable for chat ${chatId}`);
  }
  return sendByWebhook(sessionWebhook, await getDingTalkAccessToken(), {
    msgtype: "markdown",
    markdown: { title, text },
  });
}

export async function downloadDingTalkRobotMessageFile(
  downloadCode: string,
  robotCode: string,
): Promise<DingTalkDownloadedMessageFile> {
  return downloadRobotMessageFileWithAccessToken(
    await getDingTalkAccessToken(),
    downloadCode,
    robotCode,
  );
}

export async function sendDingTalkProactiveText(
  target: DingTalkActiveTarget,
  content: string,
  log: LoggerLike,
) {
  const attempts = await buildProactiveAttempts(target, content, resolveUnionId);
  if (attempts.length === 0) {
    throw new Error("DingTalk proactive target is incomplete");
  }

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      await openApi(attempt.path, attempt.body);
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("robot") || message.includes("resource.not.found")) {
        log.debug(`DingTalk proactive ${attempt.label} send failed:`, error);
      } else {
        log.warn(`DingTalk proactive ${attempt.label} send failed:`, error);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`DingTalk proactive send failed for chat ${target.chatId}`);
}

function normalizeMediaTarget(target: DingTalkMediaTarget) {
  return {
    chatId: target.chatId,
    conversationType: target.conversationType,
    robotCode: target.robotCode,
    userId: "userId" in target ? target.userId : target.senderStaffId,
  };
}

function buildMediaAttempts(
  target: ReturnType<typeof normalizeMediaTarget>,
  payload: ReturnType<typeof buildMediaPayload>,
) {
  if (!target.robotCode) {
    throw new Error("DingTalk native media target is missing robotCode");
  }

  const baseBody = { robotCode: target.robotCode, ...payload };
  const groupAttempt = {
    label: "group",
    path: "/v1.0/robot/groupMessages/send",
    body: { openConversationId: target.chatId, ...baseBody },
  };
  const singleAttempt = target.userId
    ? {
        label: "single",
        path: "/v1.0/robot/oToMessages/batchSend",
        body: { userIds: [target.userId], ...baseBody },
      }
    : undefined;

  if (isGroupConversation(target.conversationType)) {
    return [groupAttempt];
  }
  if (isSingleConversation(target.conversationType)) {
    return singleAttempt ? [singleAttempt, groupAttempt] : [groupAttempt];
  }
  return singleAttempt ? [singleAttempt, groupAttempt] : [groupAttempt];
}

export async function uploadDingTalkMedia(
  filePath: string,
  mediaType: DingTalkMediaType,
) {
  const fileName = basename(filePath);
  const buffer = await readFile(filePath);
  return uploadRobotMediaWithAccessToken(
    await getDingTalkAccessToken(),
    mediaType,
    fileName,
    buffer,
  );
}

export async function sendDingTalkNativeMedia(
  target: DingTalkMediaTarget,
  mediaId: string,
  mediaType: DingTalkMediaType,
  fileName: string | undefined,
  log: LoggerLike,
) {
  const attempts = buildMediaAttempts(
    normalizeMediaTarget(target),
    buildMediaPayload(mediaId, mediaType, fileName),
  );

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return await openApi(attempt.path, attempt.body);
    } catch (error) {
      lastError = error;
      log.debug(`DingTalk native media send failed (${attempt.label}):`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`DingTalk native media send failed for chat ${target.chatId}`);
}

export function prepareDingTalkStreamingCard(
  target: string | DingTalkStreamingTarget,
  templateId: string,
  cardData: Record<string, unknown>,
  log: LoggerLike,
) {
  return prepareStreamingCardRequest(cardDeps(log), target, templateId, cardData);
}

export function updateDingTalkStreamingCard(
  conversationToken: string,
  templateId: string,
  cardData: Record<string, unknown>,
  log: LoggerLike,
) {
  return updateStreamingCardRequest(
    cardDeps(log),
    conversationToken,
    templateId,
    cardData,
  );
}

export function finishDingTalkStreamingCard(
  conversationToken: string,
  log: LoggerLike,
) {
  return finishStreamingCardRequest(cardDeps(log), conversationToken);
}

export function createAndDeliverDingTalkCard(
  target: DingTalkStreamingTarget,
  templateId: string,
  outTrackId: string,
  cardData: Record<string, unknown>,
  log: LoggerLike,
) {
  return createAndDeliverCardRequest(
    cardDeps(log),
    target,
    templateId,
    outTrackId,
    cardData,
  );
}

export function updateDingTalkCardInstance(
  outTrackId: string,
  cardData: Record<string, unknown>,
  log: LoggerLike,
) {
  return updateCardInstanceRequest(cardDeps(log), outTrackId, cardData);
}

export function sendDingTalkRobotInteractiveCard(
  target: DingTalkStreamingTarget,
  cardBizId: string,
  cardData: Record<string, unknown>,
  log: LoggerLike,
) {
  return sendRobotInteractiveCardRequest(cardDeps(log), target, cardBizId, cardData);
}

export function updateDingTalkRobotInteractiveCard(
  cardBizId: string,
  cardData: Record<string, unknown>,
  log: LoggerLike,
) {
  return updateRobotInteractiveCardRequest(cardDeps(log), cardBizId, cardData);
}
