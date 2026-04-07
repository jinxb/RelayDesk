import type { DingTalkActiveTarget } from "../../../state/src/index.js";
import { buildTextPayload } from "./card-payload.js";

function normalizeConversationType(type?: string) {
  return type?.trim().toLowerCase();
}

export function isSingleConversation(type?: string) {
  const normalized = normalizeConversationType(type);
  return (
    normalized === "0" ||
    normalized === "single" ||
    normalized === "singlechat" ||
    normalized === "oto"
  );
}

export function isGroupConversation(type?: string) {
  const normalized = normalizeConversationType(type);
  return (
    normalized === "1" ||
    normalized === "2" ||
    normalized === "group" ||
    normalized === "groupchat"
  );
}

export function getRobotCode(target: DingTalkActiveTarget) {
  if (!target.robotCode) {
    throw new Error("DingTalk proactive target is missing robotCode");
  }
  return target.robotCode;
}

export async function resolveUnionIdByUserId(
  userId: string | undefined,
  cache: Map<string, string>,
  callOapi: (path: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>,
) {
  if (!userId) return undefined;
  const cached = cache.get(userId);
  if (cached) return cached;

  const result = await callOapi("/topapi/v2/user/get", {
    userid: userId,
    language: "zh_CN",
  });
  const unionId = (result.result as Record<string, unknown> | undefined)?.unionid;
  if (typeof unionId === "string" && unionId.length > 0) {
    cache.set(userId, unionId);
    return unionId;
  }
  return undefined;
}

export async function buildProactiveAttempts(
  target: DingTalkActiveTarget,
  content: string,
  resolveUnionId: (userId?: string) => Promise<string | undefined>,
) {
  const robotCode = getRobotCode(target);
  const payload = buildTextPayload(content);
  const normalizedType = normalizeConversationType(target.conversationType);
  const attempts: Array<{ label: string; path: string; body: Record<string, unknown> }> = [];

  const pushSingle = () => {
    if (!target.userId) return;
    attempts.push({
      label: "single",
      path: "/v1.0/robot/oToMessages/batchSend",
      body: {
        robotCode,
        userIds: [target.userId],
        ...payload,
      },
    });
  };

  const pushGroup = () => {
    attempts.push({
      label: "group",
      path: "/v1.0/robot/groupMessages/send",
      body: {
        robotCode,
        openConversationId: target.chatId,
        ...payload,
      },
    });
  };

  if (normalizedType === "1" || normalizedType === "2" || normalizedType === "group" || normalizedType === "groupchat") {
    pushGroup();
    return attempts;
  }

  if (normalizedType === "0" || normalizedType === "single" || normalizedType === "singlechat" || normalizedType === "oto") {
    pushSingle();
    if (attempts.length === 0) pushGroup();
    return attempts;
  }

  const unionId = await resolveUnionId(target.userId);
  if (unionId) {
    attempts.push({
      label: "unknown-unionid",
      path: "/v1.0/robot/oToMessages/batchSend",
      body: {
        robotCode,
        userIds: [target.userId],
        ...payload,
      },
    });
  }
  pushGroup();
  pushSingle();
  return attempts;
}
