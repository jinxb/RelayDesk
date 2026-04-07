export const MAX_TIMEOUT_MS = 2_147_483_647;
export const DEFAULT_TOOL_TIMEOUT_MS = 10 * 60 * 1000;
export const DEFAULT_CODEX_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60 * 1000;

export function sanitizeTimeoutMs(value: number | undefined): number | undefined {
  return Number.isFinite(value) && value! > 0
    ? Math.min(value!, MAX_TIMEOUT_MS)
    : undefined;
}

export function parseTimeoutMs(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return sanitizeTimeoutMs(parsed);
}

export function resolveConfiguredTimeoutMs(
  fileValue: number | undefined,
  envValue: string | undefined,
  fallback: number,
): number {
  return parseTimeoutMs(envValue) ?? sanitizeTimeoutMs(fileValue) ?? fallback;
}

export function clampIdleTimeoutMs(idleTimeoutMs: number, totalTimeoutMs: number): number {
  return totalTimeoutMs > 0
    ? Math.min(idleTimeoutMs, totalTimeoutMs)
    : idleTimeoutMs;
}
