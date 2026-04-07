const ENVELOPE_DEDUPE_TTL_MS = 60_000;
const MAX_DEDUPE_ENTRIES = 200;

const processedEnvelopeIds = new Map<string, number>();

function cleanupProcessedEnvelopeIds(now: number): void {
  for (const [msgId, timestamp] of processedEnvelopeIds) {
    if (now - timestamp > ENVELOPE_DEDUPE_TTL_MS) {
      processedEnvelopeIds.delete(msgId);
    }
  }
}

export function isDuplicateWeChatEnvelope(msgId: string): boolean {
  if (!msgId) return false;
  if (processedEnvelopeIds.has(msgId)) {
    return true;
  }
  processedEnvelopeIds.set(msgId, Date.now());
  if (processedEnvelopeIds.size > MAX_DEDUPE_ENTRIES) {
    cleanupProcessedEnvelopeIds(Date.now());
  }
  return false;
}

export function resetWeChatEnvelopeDedupe(): void {
  processedEnvelopeIds.clear();
}
