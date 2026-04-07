import { DWClient, TOPIC_ROBOT, type DWClientDownStream } from "dingtalk-stream";
import { createLogger, type Config, type DingTalkActiveTarget } from "../../../state/src/index.js";
import type { DingTalkStreamingTarget } from "./card-client.js";
import type { DingTalkMediaType } from "./card-payload.js";
import {
  createAndDeliverDingTalkCard,
  downloadDingTalkRobotMessageFile,
  finishDingTalkStreamingCard,
  prepareDingTalkStreamingCard,
  sendDingTalkMarkdown,
  sendDingTalkNativeMedia,
  sendDingTalkProactiveText,
  sendDingTalkRobotInteractiveCard,
  sendDingTalkText,
  uploadDingTalkMedia,
  updateDingTalkCardInstance,
  updateDingTalkRobotInteractiveCard,
  updateDingTalkStreamingCard,
  type DingTalkDownloadedMessageFile,
} from "./client-api.js";
import {
  clearDingTalkRuntime,
  getDingTalkClient,
  getDingTalkMessageHandler,
  setDingTalkClient,
  setDingTalkMessageHandler,
  registerSessionWebhook,
} from "./runtime.js";
import {
  installDingTalkSocketWarnFilter,
  shouldSuppressDingTalkSocketWarn,
} from "./socket-warn.js";
import {
  startManagedDingTalkGateway,
  stopManagedDingTalkGateway,
} from "./gateway.js";

const log = createLogger("DingTalk");

export { registerSessionWebhook, shouldSuppressDingTalkSocketWarn };
export type { DingTalkDownloadedMessageFile, DingTalkStreamingTarget };

export function ackMessage(messageId: string, result: unknown = { ok: true }) {
  try {
    const client = getDingTalkClient();
    if (!messageId) return;
    client.socketCallBackResponse(messageId, result);
  } catch (error) {
    log.debug("Failed to ack DingTalk callback:", error);
  }
}

export function formatDingTalkInitError(error: unknown): string {
  if (error instanceof Error && !(error as { response?: unknown }).response) {
    return error.message;
  }
  const record = error as {
    response?: { status?: number; data?: { Code?: string; Message?: string } };
    message?: string;
  };
  const status = record?.response?.status;
  const data = record?.response?.data;
  if (status === 429 || data?.Code === "Throttling") {
    const message = typeof data?.Message === "string" ? data.Message : "请求被限流";
    return `钉钉网关限流(429): ${message}。请稍后重试或减少连接/重启频率。`;
  }
  if (typeof record?.message === "string") {
    return record.message;
  }
  return String(error).slice(0, 200);
}

export async function initDingTalk(
  cfg: Config,
  eventHandler: (data: DWClientDownStream) => Promise<void>,
) {
  if (!cfg.dingtalkClientId || !cfg.dingtalkClientSecret) {
    throw new Error("DingTalk clientId and clientSecret are required");
  }

  setDingTalkMessageHandler(eventHandler);
  installDingTalkSocketWarnFilter(log);
  await startManagedDingTalkGateway({
    cfg,
    logger: log,
    createClient: (config) =>
      new DWClient({
        clientId: config.dingtalkClientId as string,
        clientSecret: config.dingtalkClientSecret as string,
        keepAlive: true,
        debug: false,
      }),
    bindClient: (client) => {
      setDingTalkClient(client);
      client.registerCallbackListener(TOPIC_ROBOT, async (data: DWClientDownStream) => {
        const handler = getDingTalkMessageHandler();
        if (!handler) return;
        try {
          await handler(data);
        } catch (error) {
          log.error("Unhandled DingTalk callback error:", error);
          ackMessage(data.headers.messageId, { error: String(error) });
        }
      });
    },
    clearClient: () => {
      setDingTalkClient(null);
    },
    formatInitError: formatDingTalkInitError,
  });
}

export function stopDingTalk() {
  stopManagedDingTalkGateway();
  try {
    getDingTalkClient().disconnect();
  } catch (error) {
    log.debug("Failed to disconnect DingTalk client:", error);
  } finally {
    clearDingTalkRuntime();
    log.info("DingTalk client stopped");
  }
}

export async function sendText(chatId: string, content: string) {
  return sendDingTalkText(chatId, content);
}

export async function sendMarkdown(chatId: string, title: string, text: string) {
  return sendDingTalkMarkdown(chatId, title, text);
}

export async function downloadRobotMessageFile(
  downloadCode: string,
  robotCode: string,
): Promise<DingTalkDownloadedMessageFile> {
  return downloadDingTalkRobotMessageFile(downloadCode, robotCode);
}

export async function sendProactiveText(
  target: string | DingTalkActiveTarget,
  content: string,
) {
  if (typeof target === "string") {
    await sendText(target, content);
    return;
  }
  return sendDingTalkProactiveText(target, content, log);
}

export async function uploadMedia(filePath: string, mediaType: DingTalkMediaType) {
  return uploadDingTalkMedia(filePath, mediaType);
}

export async function sendMedia(
  target: DingTalkStreamingTarget | DingTalkActiveTarget,
  mediaId: string,
  mediaType: DingTalkMediaType,
  fileName?: string,
) {
  return sendDingTalkNativeMedia(target, mediaId, mediaType, fileName, log);
}

export async function prepareStreamingCard(
  target: string | DingTalkStreamingTarget,
  templateId: string,
  cardData: Record<string, unknown>,
) {
  return prepareDingTalkStreamingCard(target, templateId, cardData, log);
}

export async function updateStreamingCard(
  conversationToken: string,
  templateId: string,
  cardData: Record<string, unknown>,
) {
  return updateDingTalkStreamingCard(conversationToken, templateId, cardData, log);
}

export async function finishStreamingCard(conversationToken: string) {
  return finishDingTalkStreamingCard(conversationToken, log);
}

export async function createAndDeliverCard(
  target: DingTalkStreamingTarget,
  templateId: string,
  outTrackId: string,
  cardData: Record<string, unknown>,
) {
  return createAndDeliverDingTalkCard(target, templateId, outTrackId, cardData, log);
}

export async function updateCardInstance(
  outTrackId: string,
  cardData: Record<string, unknown>,
) {
  return updateDingTalkCardInstance(outTrackId, cardData, log);
}

export async function sendRobotInteractiveCard(
  target: DingTalkStreamingTarget,
  cardBizId: string,
  cardData: Record<string, unknown>,
) {
  return sendDingTalkRobotInteractiveCard(target, cardBizId, cardData, log);
}

export async function updateRobotInteractiveCard(
  cardBizId: string,
  cardData: Record<string, unknown>,
) {
  return updateDingTalkRobotInteractiveCard(cardBizId, cardData, log);
}
