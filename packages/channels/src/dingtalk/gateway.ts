import type { DWClient } from "dingtalk-stream";
import type { Config } from "../../../state/src/index.js";

export const DINGTALK_WATCHDOG_INTERVAL_MS = 5_000;
export const DINGTALK_CONNECT_TIMEOUT_MS = 30_000;
export const DINGTALK_REGISTER_TIMEOUT_MS = 30_000;
export const DINGTALK_DISCONNECT_GRACE_MS = 15_000;
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 60_000;
const RECONNECT_JITTER_RATIO = 0.2;
const STARTUP_FAILURE_LIMIT = 3;

export type DingTalkReconnectReason = "connect_error" | "connect_timeout" | "register_timeout" | "connection_lost" | "session_error";

export type DingTalkGatewaySessionResult = { kind: "stopped" } | { kind: "reconnect"; reason: DingTalkReconnectReason; error?: unknown };

export interface DingTalkGatewayClient {
  connected: boolean;
  registered: boolean;
  connect(): Promise<void>;
  disconnect(): void;
}

interface GatewayLogger {
  info(message: string): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

interface RunGatewaySessionParams {
  client: DingTalkGatewayClient;
  signal: AbortSignal;
  logger: GatewayLogger;
  onReady: () => void;
}

interface StartManagedGatewayParams {
  cfg: Config;
  logger: GatewayLogger;
  createClient: (cfg: Config) => DWClient;
  bindClient: (client: DWClient) => void;
  clearClient: () => void;
  formatInitError: (error: unknown) => string;
}

interface ActiveGateway {
  readonly stopController: AbortController;
  readonly readyPromise: Promise<void>;
}

let activeGateway: ActiveGateway | null = null;

function sleepWithAbort(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    const timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function raceConnectAttempt(params: {
  client: DingTalkGatewayClient;
  signal: AbortSignal;
}): Promise<"started" | "timeout" | "aborted" | { error: unknown }> {
  let capturedError: unknown;
  const connectPromise = params.client.connect().then(
    () => "started" as const,
    (error) => {
      capturedError = error;
      return "error" as const;
    },
  );
  const timeoutPromise = sleepWithAbort(DINGTALK_CONNECT_TIMEOUT_MS, params.signal).then(
    (running) => running ? ("timeout" as const) : ("aborted" as const),
  );
  const winner = await Promise.race([connectPromise, timeoutPromise]);
  if (winner === "error") {
    return { error: capturedError };
  }
  return winner;
}

function startupFailureError(
  result: Extract<DingTalkGatewaySessionResult, { kind: "reconnect" }>,
  formatInitError: (error: unknown) => string,
): Error {
  if (result.reason === "connect_timeout") {
    return new Error("DingTalk gateway connect timeout before becoming ready.");
  }
  if (result.reason === "register_timeout") {
    return new Error("DingTalk gateway connected but did not register before timeout.");
  }
  if (result.reason === "connection_lost") {
    return new Error("DingTalk gateway connection was lost before becoming ready.");
  }
  return new Error(formatInitError(result.error ?? result.reason));
}

export function resolveReconnectDelayMs(attempt: number, randomValue = Math.random()): number {
  const safeAttempt = Math.max(1, attempt);
  const expoBase = RECONNECT_BASE_DELAY_MS * 2 ** (safeAttempt - 1);
  const boundedBase = Math.min(RECONNECT_MAX_DELAY_MS, expoBase);
  const normalizedRandom = Math.min(1, Math.max(0, randomValue));
  const jitter = (normalizedRandom * 2 - 1) * RECONNECT_JITTER_RATIO;
  return Math.max(RECONNECT_BASE_DELAY_MS, Math.round(boundedBase * (1 + jitter)));
}

export async function runDingTalkGatewaySession(
  params: RunGatewaySessionParams,
): Promise<DingTalkGatewaySessionResult> {
  const { client, signal, logger, onReady } = params;
  const connectAttempt = await raceConnectAttempt({ client, signal });
  if (connectAttempt === "aborted") {
    return { kind: "stopped" };
  }
  if (connectAttempt === "timeout") {
    logger.warn(`[gateway] connect timeout after ${DINGTALK_CONNECT_TIMEOUT_MS}ms`);
    return { kind: "reconnect", reason: "connect_timeout" };
  }
  if (typeof connectAttempt === "object" && "error" in connectAttempt) {
    logger.warn(`[gateway] connect error: ${String(connectAttempt.error)}`);
    return { kind: "reconnect", reason: "connect_error", error: connectAttempt.error };
  }

  logger.info("Stream client connect invoked");
  const sessionStartAt = Date.now();
  let ready = false;
  let firstConnectedAt: number | null = null;
  let disconnectedAt: number | null = null;

  while (true) {
    if (signal.aborted) {
      return { kind: "stopped" };
    }

    const now = Date.now();
    if (client.connected && firstConnectedAt === null) {
      firstConnectedAt = now;
      logger.info("[gateway] socket connected");
    }

    if (client.connected && client.registered) {
      disconnectedAt = null;
      if (!ready) {
        ready = true;
        logger.info("[gateway] stream registered");
        onReady();
      }
    } else if (client.connected && !ready && now - sessionStartAt > DINGTALK_REGISTER_TIMEOUT_MS) {
      logger.warn(
        `[gateway] registration not confirmed after ${DINGTALK_REGISTER_TIMEOUT_MS}ms`,
      );
      return { kind: "reconnect", reason: "register_timeout" };
    } else if (!client.connected && firstConnectedAt !== null) {
      if (disconnectedAt === null) {
        disconnectedAt = now;
        logger.warn("[gateway] connection lost, waiting for grace window");
      } else if (now - disconnectedAt >= DINGTALK_DISCONNECT_GRACE_MS) {
        return { kind: "reconnect", reason: "connection_lost" };
      }
    }

    const keepRunning = await sleepWithAbort(DINGTALK_WATCHDOG_INTERVAL_MS, signal);
    if (!keepRunning) {
      return { kind: "stopped" };
    }
  }
}

async function runManagedGatewayLoop(
  params: StartManagedGatewayParams & { signal: AbortSignal; markReady: () => void },
): Promise<void> {
  const { cfg, logger, createClient, bindClient, clearClient, formatInitError, signal, markReady } = params;
  let startupFailures = 0;
  let reconnectAttempt = 0;
  let gatewayReady = false;

  while (!signal.aborted) {
    const client = createClient(cfg);
    bindClient(client);
    let sessionResult: DingTalkGatewaySessionResult;

    try {
      sessionResult = await runDingTalkGatewaySession({
        client,
        signal,
        logger,
        onReady: () => {
          if (gatewayReady) {
            return;
          }
          gatewayReady = true;
          startupFailures = 0;
          reconnectAttempt = 0;
          markReady();
        },
      });
    } catch (error) {
      logger.error(`[gateway] fatal session error: ${String(error)}`);
      sessionResult = { kind: "reconnect", reason: "session_error", error };
    } finally {
      try {
        client.disconnect();
      } catch (error) {
        logger.warn(`[gateway] disconnect failed: ${String(error)}`);
      }
      clearClient();
    }

    if (sessionResult.kind === "stopped" || signal.aborted) {
      return;
    }

    if (!gatewayReady) {
      startupFailures += 1;
      if (startupFailures >= STARTUP_FAILURE_LIMIT) {
        throw startupFailureError(sessionResult, formatInitError);
      }
    }

    reconnectAttempt += 1;
    const delayMs = resolveReconnectDelayMs(reconnectAttempt);
    logger.warn(
      `[gateway] reconnect scheduled in ${delayMs}ms (attempt=${reconnectAttempt}, reason=${sessionResult.reason})`,
    );
    const keepRunning = await sleepWithAbort(delayMs, signal);
    if (!keepRunning) {
      return;
    }
  }
}

export async function startManagedDingTalkGateway(
  params: StartManagedGatewayParams,
): Promise<void> {
  if (activeGateway) {
    return activeGateway.readyPromise;
  }

  const stopController = new AbortController();
  let settled = false;
  let resolveReady: (() => void) | null = null;
  let rejectReady: ((error: Error) => void) | null = null;

  const readyPromise = new Promise<void>((resolve, reject) => {
    resolveReady = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };
    rejectReady = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };
  });

  activeGateway = {
    stopController,
    readyPromise,
  };

  void runManagedGatewayLoop({
    ...params,
    signal: stopController.signal,
    markReady: () => resolveReady?.(),
  }).catch((error) => {
    rejectReady?.(error instanceof Error ? error : new Error(String(error)));
  }).finally(() => {
    if (!settled && stopController.signal.aborted) {
      rejectReady?.(new Error("DingTalk gateway stopped before becoming ready."));
    }
    activeGateway = null;
  });

  return readyPromise;
}

export function stopManagedDingTalkGateway(): void {
  activeGateway?.stopController.abort();
}
