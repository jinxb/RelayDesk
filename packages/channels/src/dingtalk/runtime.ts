import { type DWClient, type DWClientDownStream } from "dingtalk-stream";
import { clearDingTalkInboundDedupe } from "./inbound-dedupe.js";

let client: DWClient | null = null;
let messageHandler: ((data: DWClientDownStream) => Promise<void>) | null = null;
const sessionWebhookByChat = new Map<string, string>();
const unionIdByUserId = new Map<string, string>();

export function setDingTalkClient(next: DWClient | null) {
  client = next;
}

export function getDingTalkClient() {
  if (!client) {
    throw new Error("DingTalk client not initialized");
  }
  return client;
}

export async function getDingTalkAccessToken() {
  return String(await getDingTalkClient().getAccessToken());
}

export function setDingTalkMessageHandler(
  handler: ((data: DWClientDownStream) => Promise<void>) | null,
) {
  messageHandler = handler;
}

export function getDingTalkMessageHandler() {
  return messageHandler;
}

export function registerSessionWebhook(chatId: string, sessionWebhook: string) {
  if (!chatId || !sessionWebhook) return;
  sessionWebhookByChat.set(chatId, sessionWebhook);
}

export function getSessionWebhook(chatId: string) {
  return sessionWebhookByChat.get(chatId);
}

export function getUnionIdCache() {
  return unionIdByUserId;
}

export function clearDingTalkRuntime() {
  sessionWebhookByChat.clear();
  unionIdByUserId.clear();
  clearDingTalkInboundDedupe();
  client = null;
  messageHandler = null;
}
