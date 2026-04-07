const MIN_CONTENT_DELTA_CHARS = 30;
const MIN_ELAPSED_MS = 500;
const DEFAULT_DEBOUNCE_MS = 150;

interface PendingUpdate {
  readonly content: string;
  readonly toolNote?: string;
}

export interface TelegramStreamUpdaterOptions {
  readonly sendUpdate: (content: string, toolNote?: string) => Promise<void>;
  readonly getDelay: (contentLength: number) => number;
  readonly onSuccess?: () => void;
  readonly onError?: () => void;
  readonly debounceMs?: number;
}

export interface TelegramStreamUpdater {
  schedule: (content: string, toolNote?: string) => void;
  finish: () => Promise<void>;
  reset: () => void;
}

function clearTimer(timer: ReturnType<typeof setTimeout> | null) {
  if (timer) {
    clearTimeout(timer);
  }
}

export function createTelegramStreamUpdater(
  options: TelegramStreamUpdaterOptions,
): TelegramStreamUpdater {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  let closed = false;
  let lastUpdateTime = 0;
  let lastContentLength = 0;
  let updateInProgress = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let queuedUpdate: PendingUpdate | null = null;
  let activeUpdate: Promise<void> | null = null;

  function clearPending() {
    clearTimer(debounceTimer);
    debounceTimer = null;
    queuedUpdate = null;
  }

  async function performUpdate(next: PendingUpdate): Promise<void> {
    if (closed) {
      return;
    }

    if (updateInProgress) {
      queuedUpdate = next;
      return;
    }

    updateInProgress = true;
    activeUpdate = (async () => {
      try {
        await options.sendUpdate(next.content, next.toolNote);
        options.onSuccess?.();
        lastUpdateTime = Date.now();
      } catch {
        options.onError?.();
      } finally {
        updateInProgress = false;
        activeUpdate = null;
        if (!closed && queuedUpdate) {
          const followUp = queuedUpdate;
          queuedUpdate = null;
          await performUpdate(followUp);
        }
      }
    })();

    await activeUpdate;
  }

  function shouldSkipTinyUpdate(content: string) {
    const elapsed = Date.now() - lastUpdateTime;
    const contentGrowth = content.length - lastContentLength;
    if (lastContentLength === 0) {
      return false;
    }

    return contentGrowth < MIN_CONTENT_DELTA_CHARS && elapsed < MIN_ELAPSED_MS;
  }

  return {
    schedule(content: string, toolNote?: string) {
      if (closed) {
        return;
      }

      if (shouldSkipTinyUpdate(content)) {
        lastContentLength = content.length;
        return;
      }

      lastContentLength = content.length;
      clearTimer(debounceTimer);
      const delay = Math.max(debounceMs, options.getDelay(content.length));
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void performUpdate({ content, toolNote });
      }, delay);
    },
    async finish() {
      if (closed) {
        await activeUpdate;
        return;
      }

      closed = true;
      clearPending();
      await activeUpdate;
    },
    reset() {
      closed = true;
      clearPending();
    },
  };
}
