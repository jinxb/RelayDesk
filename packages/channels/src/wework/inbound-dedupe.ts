const MESSAGE_DEDUPE_TTL_MS = 60_000;
const MESSAGE_DEDUPE_MAX_ENTRIES = 10_000;

const processedMessageIds = new Map<string, number>();

function trimProcessedMessageIds(now: number): void {
  for (const [messageId, timestamp] of processedMessageIds) {
    if (now - timestamp > MESSAGE_DEDUPE_TTL_MS) {
      processedMessageIds.delete(messageId);
    }
  }

  while (processedMessageIds.size > MESSAGE_DEDUPE_MAX_ENTRIES) {
    const oldest = processedMessageIds.keys().next().value;
    if (typeof oldest !== "string") {
      break;
    }
    processedMessageIds.delete(oldest);
  }
}

export function isDuplicateWeWorkMessage(messageId: string, now = Date.now()): boolean {
  if (!messageId) {
    return false;
  }
  const previous = processedMessageIds.get(messageId);
  if (typeof previous === "number" && now - previous < MESSAGE_DEDUPE_TTL_MS) {
    return true;
  }
  if (typeof previous === "number") {
    processedMessageIds.delete(messageId);
  }
  processedMessageIds.set(messageId, now);
  trimProcessedMessageIds(now);
  return false;
}

export function clearWeWorkInboundDedupe(): void {
  processedMessageIds.clear();
}
