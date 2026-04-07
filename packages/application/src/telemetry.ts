import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import {
  APP_HOME,
  CONFIG_PATH,
  loadFileConfig,
  type FileConfig,
} from "../../state/src/index.js";
import { getChannelHealthSnapshot } from "./channel-health.js";
import { buildChannelProbeSnapshots } from "./channel-probe-results.js";
import { readJournalExcerpt } from "./journal.js";
import { buildRuntimeRouteSummaries } from "./runtime-route-summaries.js";
import {
  commandReady,
  findCodexAuth,
  normalizeWorkspaceConfig,
  resolveClaudeCredentialState,
  sanitizeClaudeEnv,
} from "./workspace.js";
import { readRuntimeStatus } from "./runtime-control.js";

export function readSessionsSnapshot() {
  const sessionsPath = join(APP_HOME, "data", "sessions.json");
  const activeChatsPath = join(APP_HOME, "data", "active-chats.json");

  const sessions = existsSync(sessionsPath)
    ? JSON.parse(readFileSync(sessionsPath, "utf-8")) as Record<string, unknown>
    : {};
  const activeChats = existsSync(activeChatsPath)
    ? JSON.parse(readFileSync(activeChatsPath, "utf-8")) as Record<string, unknown>
    : {};

  return {
    sessionCount: Object.keys(sessions).length,
    sessions,
    activeChats,
  };
}

export { readJournalExcerpt } from "./journal.js";

export function buildDiagnostics(
  workspace: FileConfig,
  claudeEnv: Record<string, string>,
) {
  const normalized = normalizeWorkspaceConfig(workspace);
  const logDir = normalized.logDir || join(APP_HOME, "logs");

  return {
    nodeVersion: process.version,
    platform: `${process.platform}-${process.arch}`,
    configPath: CONFIG_PATH,
    appHome: APP_HOME,
    logDir,
    codexReady:
      commandReady(normalized.tools?.codex?.cliPath ?? "codex") &&
      findCodexAuth(),
    codebuddyReady: commandReady(
      normalized.tools?.codebuddy?.cliPath ?? "codebuddy",
    ),
    claudeReady: resolveClaudeCredentialState(normalized, claudeEnv),
  };
}

export function buildBootstrapPayload() {
  const workspace = normalizeWorkspaceConfig(loadFileConfig());
  const claudeEnv = sanitizeClaudeEnv(workspace.tools?.claude?.env ?? {});
  const diagnostics = buildDiagnostics(workspace, claudeEnv);
  const sessions = readSessionsSnapshot();

  return {
    brand: {
      name: "RelayDesk",
      line: "Trusted messaging orchestration for local coding agents.",
      apiBaseUrl: `http://127.0.0.1:${process.env.RELAYDESK_API_PORT ?? "44919"}`,
    },
    workspace,
    claudeEnv,
    runtime: readRuntimeStatus(),
    health: getChannelHealthSnapshot(workspace),
    probes: buildChannelProbeSnapshots(workspace),
    routes: buildRuntimeRouteSummaries({
      workspace,
      sessions: sessions.sessions,
      activeChats: sessions.activeChats,
    }),
    diagnostics,
    sessions,
    journal: readJournalExcerpt(diagnostics.logDir),
  };
}
