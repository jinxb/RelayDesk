import { randomBytes } from "node:crypto";
import type { DingTalkStreamingTarget } from "./client.js";

export interface SenderSettings {
  cardTemplateId?: string;
  robotCodeFallback?: string;
}

export interface StreamState {
  chatId: string;
  mode: "card" | "cardInstance" | "interactiveCard" | "text";
  conversationToken?: string;
  outTrackId?: string;
  cardBizId?: string;
  toolId: string;
  target?: DingTalkStreamingTarget;
}

let senderSettings: SenderSettings = {};
const streamStates = new Map<string, StreamState>();

export function configureDingTalkSenderSettings(settings: SenderSettings): void {
  senderSettings = {
    cardTemplateId: settings.cardTemplateId?.trim(),
    robotCodeFallback: settings.robotCodeFallback?.trim(),
  };
}

export function getCardTemplateId() {
  return senderSettings.cardTemplateId?.trim() || undefined;
}

export function getRobotCodeFallback() {
  return senderSettings.robotCodeFallback?.trim() || undefined;
}

export function generateMessageId() {
  return `${Date.now()}-${randomBytes(6).toString("hex")}`;
}

export function setStreamState(messageId: string, state: StreamState) {
  streamStates.set(messageId, state);
}

export function getStreamState(messageId: string) {
  return streamStates.get(messageId);
}

export function deleteStreamState(messageId: string) {
  streamStates.delete(messageId);
}
