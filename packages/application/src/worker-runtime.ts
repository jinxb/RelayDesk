import { createServer } from "node:http";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  APP_HOME,
  PORT_FILE_NAME,
  SHUTDOWN_PORT,
  SessionManager,
  closeLogger,
  createLogger,
  flushActiveChats,
  getConfiguredAiCommands,
  initLogger,
  loadActiveChats,
  loadConfig,
} from "../../state/src/index.js";
import { cleanupAdapters, initAdapters } from "../../agents/src/index.js";
import {
  publishOfflineNotices,
  publishOnlineNotices,
  startConfiguredChannels,
  stopConfiguredChannels,
} from "./platform-runtime.js";
import { engageRuntimeKeepAwake, type KeepAwakeLease } from "./runtime-keepawake.js";
import { startRuntimeMediaHookServer, type RuntimeMediaHookServer } from "./runtime-media-hook.js";
import { handleRuntimeShutdownFailure } from "./runtime-shutdown.js";

const log = createLogger("RelayWorker");

function buildStartupFailureMessage(
  failures: readonly { channel: string; message: string }[],
): string {
  const summary = failures
    .map((failure) => `${failure.channel}: ${failure.message}`)
    .join(" | ");
  return `RelayDesk worker failed to initialize all enabled channels. ${summary}`;
}

function ensurePortFile() {
  const portFile = join(APP_HOME, PORT_FILE_NAME);
  if (!existsSync(dirname(portFile))) {
    mkdirSync(dirname(portFile), { recursive: true });
  }
  writeFileSync(portFile, String(SHUTDOWN_PORT), "utf-8");
}

function removePortFile() {
  const portFile = join(APP_HOME, PORT_FILE_NAME);
  if (existsSync(portFile)) {
    unlinkSync(portFile);
  }
}

async function openShutdownServer(
  onShutdown: () => Promise<void>,
): Promise<ReturnType<typeof createServer>> {
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      if (request.url !== "/shutdown" && request.url !== "/") {
        response.writeHead(404);
        response.end();
        return;
      }

      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("ok");
      onShutdown().catch((error) => handleRuntimeShutdownFailure("http", error));
    });

    server.listen(SHUTDOWN_PORT, "127.0.0.1", () => {
      ensurePortFile();
      resolve(server);
    });
    server.on("error", reject);
  });
}

function installSignalHandlers(shutdown: () => Promise<void>) {
  process.on("SIGINT", () =>
    shutdown().catch((error) => handleRuntimeShutdownFailure("signal", error)),
  );
  process.on("SIGTERM", () =>
    shutdown().catch((error) => handleRuntimeShutdownFailure("signal", error)),
  );
}

function logStartupSummary(config: ReturnType<typeof loadConfig>, startupCwd: string) {
  log.info("RelayDesk runtime booting");
  log.info(`active routes: ${getConfiguredAiCommands(config).join(", ")}`);
  log.info(`working tree: ${startupCwd}`);
  log.info(`enabled channels: ${config.enabledPlatforms.join(", ")}`);
}

async function shutdownRuntime(options: {
  readonly shutdownServer: ReturnType<typeof createServer> | null;
  readonly mediaHookServer: RuntimeMediaHookServer | null;
  readonly keepAwakeLease: KeepAwakeLease;
  readonly readyChannels: string[];
  readonly handles: Awaited<ReturnType<typeof startConfiguredChannels>>["handles"];
  readonly sessionManager: SessionManager;
  readonly startedAt: number;
}) {
  log.info("RelayDesk runtime shutting down");
  const elapsedMinutes = Math.floor((Date.now() - options.startedAt) / 1000 / 60);
  await publishOfflineNotices(options.readyChannels, elapsedMinutes);

  options.shutdownServer?.close();
  await options.mediaHookServer?.close();
  removePortFile();
  options.keepAwakeLease.release();
  await stopConfiguredChannels(options.handles);
  options.sessionManager.destroy();
  cleanupAdapters();
  flushActiveChats();
  closeLogger();
  process.exit(0);
}

export async function runWorkerRuntime() {
  const startupCwd = process.cwd();
  const config = loadConfig();

  initLogger(config.logDir, config.logLevel);
  loadActiveChats();
  await initAdapters(config);
  logStartupSummary(config, startupCwd);
  const mediaHookServer = await startRuntimeMediaHookServer();

  const sessionManager = new SessionManager(startupCwd, config.claudeWorkDir);
  sessionManager.clearAllCliSessionIds();
  const { handles, readyChannels, failedChannels } = await startConfiguredChannels(
    config,
    sessionManager,
    log,
    { currentTaskMediaHook: mediaHookServer },
  );
  if (failedChannels.length > 0) {
    await mediaHookServer.close();
    await stopConfiguredChannels(handles);
    sessionManager.destroy();
    cleanupAdapters();
    throw new Error(buildStartupFailureMessage(failedChannels));
  }
  if (readyChannels.length === 0) {
    await mediaHookServer.close();
    throw new Error("RelayDesk worker could not initialize any configured channel.");
  }

  const keepAwakeLease = engageRuntimeKeepAwake({
    enabled: config.runtime.keepAwake,
    logger: log,
  });
  log.info(`worker online: ${readyChannels.join(", ")}`);

  const startedAt = Date.now();
  let shutdownServer: ReturnType<typeof createServer> | null = null;
  const shutdown = () =>
    shutdownRuntime({
      shutdownServer,
      mediaHookServer,
      keepAwakeLease,
      readyChannels,
      handles,
      sessionManager,
      startedAt,
    });

  shutdownServer = await openShutdownServer(shutdown);
  installSignalHandlers(shutdown);
  await publishOnlineNotices(readyChannels, config, startupCwd, sessionManager);
}
