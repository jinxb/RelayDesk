const MESSAGE_DEDUPE_TTL_MS = 60_000;
const MESSAGE_DEDUPE_MAX_ENTRIES = 10_000;

const processedCallbackIds = new Map<string, number>();

function trimProcessedCallbackIds(now: number): void {
  for (const [messageId, timestamp] of processedCallbackIds) {
    if (now - timestamp > MESSAGE_DEDUPE_TTL_MS) {
      processedCallbackIds.delete(messageId);
    }
  }

  while (processedCallbackIds.size > MESSAGE_DEDUPE_MAX_ENTRIES) {
    const oldest = processedCallbackIds.keys().next().value;
    if (typeof oldest !== "string") {
      break;
    }
    processedCallbackIds.delete(oldest);
  }
}

export function isDuplicateDingTalkCallback(messageId: string, now = Date.now()): boolean {
  if (!messageId) {
    return false;
  }
  const previous = processedCallbackIds.get(messageId);
  if (typeof previous === "number" && now - previous < MESSAGE_DEDUPE_TTL_MS) {
    return true;
  }
  if (typeof previous === "number") {
    processedCallbackIds.delete(messageId);
  }
  processedCallbackIds.set(messageId, now);
  trimProcessedCallbackIds(now);
  return false;
}

export function clearDingTalkInboundDedupe(): void {
  processedCallbackIds.clear();
}
