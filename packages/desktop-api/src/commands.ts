import {
  loadConfig as loadRuntimeConfig,
  loadFileConfig,
  saveFileConfig,
  type FileConfig,
} from "../../state/src/index.js";
import {
  normalizeWorkspaceConfig,
  resolveRuntimeWorkTree,
  validateWorkspace,
  knownChannels,
  type ChannelKey,
} from "../../application/src/workspace.js";
import {
  buildBootstrapPayload,
  buildDiagnostics,
  readJournalExcerpt,
  readSessionsSnapshot,
} from "../../application/src/telemetry.js";
import { recordChannelProbeResult } from "../../application/src/channel-probe-results.js";
import {
  haltRuntime,
  launchRuntime,
  readRuntimeStatus,
} from "../../application/src/runtime-control.js";
import { sanitizeClaudeEnv } from "../../application/src/workspace.js";
import { probeChannelConfig } from "./channel-probes.js";

export interface DesktopApiRequest {
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
}

interface WorkspaceBody {
  readonly workspace?: FileConfig;
  readonly claudeEnv?: Record<string, string>;
}

interface ChannelProbeBody {
  readonly channel?: ChannelKey;
  readonly config?: Record<string, unknown>;
}

function normalizeMethod(method: string) {
  return method.trim().toUpperCase();
}

function workspaceBody(input: unknown): WorkspaceBody {
  return (input ?? {}) as WorkspaceBody;
}

function channelProbeBody(input: unknown): ChannelProbeBody {
  return (input ?? {}) as ChannelProbeBody;
}

function saveWorkspace(body: WorkspaceBody) {
  const workspace = normalizeWorkspaceConfig(body.workspace);
  const claudeEnv = sanitizeClaudeEnv(body.claudeEnv ?? {});
  if (!workspace.tools) workspace.tools = {};
  if (!workspace.tools.claude) workspace.tools.claude = {};
  workspace.tools.claude.env = claudeEnv;
  saveFileConfig(workspace);

  return {
    saved: true,
    validation: validateWorkspace(workspace, claudeEnv),
  };
}

function validateWorkspaceRequest(body: WorkspaceBody) {
  return validateWorkspace(
    normalizeWorkspaceConfig(body.workspace),
    body.claudeEnv ?? {},
  );
}

async function runtimeStartPayload() {
  const workspace = normalizeWorkspaceConfig(loadFileConfig());
  const claudeEnv = sanitizeClaudeEnv(workspace.tools?.claude?.env ?? {});
  const diagnostics = buildDiagnostics(workspace, claudeEnv);
  const validation = validateWorkspace(workspace, claudeEnv);

  if (!validation.ok) {
    throw new Error(validation.issues.join(" "));
  }

  loadRuntimeConfig();
  const runtime = await launchRuntime(resolveRuntimeWorkTree(workspace));

  return {
    started: true,
    pid: runtime.pid ?? null,
    phase: runtime.phase,
    running: runtime.running,
    startupError: runtime.startupError,
    logDir: diagnostics.logDir,
  };
}

async function runtimeStopPayload() {
  const stopped = await haltRuntime();
  return {
    stopped: true,
    pid: stopped.pid ?? null,
  };
}

async function channelProbePayload(body: ChannelProbeBody) {
  if (!body.channel || !knownChannels.includes(body.channel)) {
    throw new Error("Unknown channel.");
  }

  try {
    const message = await probeChannelConfig(
      body.channel === "wework" ? "wework" : body.channel,
      body.config ?? {},
    );
    return {
      success: true,
      message,
      probe: recordChannelProbeResult(body.channel, body.config ?? {}, true, message),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordChannelProbeResult(body.channel, body.config ?? {}, false, message);
    throw error;
  }
}

function telemetryPayload() {
  const workspace = normalizeWorkspaceConfig(loadFileConfig());
  const claudeEnv = sanitizeClaudeEnv(workspace.tools?.claude?.env ?? {});
  return buildDiagnostics(workspace, claudeEnv);
}

function journalPayload() {
  const workspace = normalizeWorkspaceConfig(loadFileConfig());
  const claudeEnv = sanitizeClaudeEnv(workspace.tools?.claude?.env ?? {});
  const diagnostics = buildDiagnostics(workspace, claudeEnv);
  return readJournalExcerpt(diagnostics.logDir);
}

export async function executeDesktopApiRequest(request: DesktopApiRequest) {
  const method = normalizeMethod(request.method);
  const body = request.body;

  if (method === "GET" && request.path === "/v1/bootstrap") {
    return buildBootstrapPayload();
  }

  if (method === "GET" && request.path === "/v1/runtime") {
    return readRuntimeStatus();
  }

  if (method === "GET" && request.path === "/v1/telemetry") {
    return telemetryPayload();
  }

  if (method === "GET" && request.path === "/v1/conversations") {
    return readSessionsSnapshot();
  }

  if (method === "GET" && request.path === "/v1/journal") {
    return journalPayload();
  }

  if (method === "PUT" && request.path === "/v1/workspace") {
    return saveWorkspace(workspaceBody(body));
  }

  if (method === "POST" && request.path === "/v1/workspace/check") {
    return validateWorkspaceRequest(workspaceBody(body));
  }

  if (method === "POST" && request.path === "/v1/runtime/start") {
    return runtimeStartPayload();
  }

  if (method === "POST" && request.path === "/v1/runtime/stop") {
    return runtimeStopPayload();
  }

  if (method === "POST" && request.path === "/v1/channels/check") {
    return channelProbePayload(channelProbeBody(body));
  }

  throw new Error("Route not found.");
}
