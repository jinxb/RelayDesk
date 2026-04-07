import { relaydeskApi } from "../lib/client";
import { desktopBridge, type ShellIdentity, type SidecarSnapshot } from "../lib/desktop";
import type { BootstrapPayload } from "../lib/models";
import type { StudioStatus, StudioTone } from "./types";
import {
  normalizeWorkspace,
  stringifyRecord,
  stringifyWorkspace,
} from "./workspace";

const RECOVERY_ATTEMPTS = 6;
const RECOVERY_DELAY_MS = 400;

export function toErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (message === "Not Found") {
    return "本地服务接口暂不可用，请刷新状态或重启桌面应用。";
  }

  return message;
}

export function buildStatus(message: string, tone: StudioTone = "neutral"): StudioStatus {
  return { message, tone };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeBootstrapPayload(payload: BootstrapPayload) {
  const workspace = normalizeWorkspace(payload.workspace);
  return {
    workspace,
    rawEditor: stringifyWorkspace(workspace),
    claudeEnvEditor: stringifyRecord(payload.claudeEnv),
  };
}

function hasConfiguredChannel(payload: BootstrapPayload) {
  return Object.values(payload.health ?? {}).some((entry) => entry.configured || entry.enabled || entry.healthy);
}

export function shouldShowSetupWizard(payload: BootstrapPayload) {
  const normalized = normalizeBootstrapPayload(payload);
  const emptyWorkspace = stringifyWorkspace(normalizeWorkspace(undefined));
  const hasCustomWorkspace = normalized.rawEditor !== emptyWorkspace;
  const hasClaudeEnv = Object.keys(payload.claudeEnv ?? {}).length > 0;

  return !hasConfiguredChannel(payload) && !hasCustomWorkspace && !hasClaudeEnv;
}

async function waitForBootstrap() {
  let lastError: unknown;
  for (let attempt = 0; attempt < RECOVERY_ATTEMPTS; attempt += 1) {
    await delay(RECOVERY_DELAY_MS);
    try {
      return await relaydeskApi.bootstrap();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("RelayDesk sidecar did not become ready.");
}

export async function bootstrapWithRecovery() {
  try {
    return {
      payload: await relaydeskApi.bootstrap(),
      recovered: false,
    };
  } catch (error) {
    if (!desktopBridge.supported()) {
      throw error;
    }

    await desktopBridge.startSidecar();
    return {
      payload: await waitForBootstrap(),
      recovered: true,
    };
  }
}

export async function readDesktopSnapshot() {
  if (!desktopBridge.supported()) {
    return {
      identity: null as ShellIdentity | null,
      sidecar: null as SidecarSnapshot | null,
    };
  }

  const [identity, sidecar] = await Promise.all([
    desktopBridge.shellIdentity(),
    desktopBridge.sidecarStatus(),
  ]);

  return { identity, sidecar };
}
