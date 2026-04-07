import type {
  BootstrapPayload,
  ChannelKey,
  ChannelProbeResult,
  FileConfigModel,
  RuntimeSnapshot,
  ValidationResult,
} from "./models";
import { desktopBridge } from "./desktop";

const apiBaseUrl =
  import.meta.env.VITE_RELAYDESK_API_URL ?? "http://127.0.0.1:44919";

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  if (desktopBridge.supported()) {
    return desktopBridge.requestSidecar<T>({
      method: init?.method ?? "GET",
      path,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;

  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed: ${response.status}`);
  }

  return payload;
}

export const relaydeskApi = {
  get apiBaseUrl() {
    return desktopBridge.supported() ? "tauri://sidecar-bridge" : apiBaseUrl;
  },
  bootstrap() {
    return request<BootstrapPayload>("/v1/bootstrap");
  },
  saveWorkspace(workspace: FileConfigModel, claudeEnv: Record<string, string>) {
    return request<{ saved: true; validation: ValidationResult }>("/v1/workspace", {
      method: "PUT",
      body: JSON.stringify({ workspace, claudeEnv }),
    });
  },
  validateWorkspace(workspace: FileConfigModel, claudeEnv: Record<string, string>) {
    return request<ValidationResult>("/v1/workspace/check", {
      method: "POST",
      body: JSON.stringify({ workspace, claudeEnv }),
    });
  },
  getRuntime() {
    return request<RuntimeSnapshot>("/v1/runtime");
  },
  startRuntime() {
    return request<{
      started: true;
      pid: number | null;
      phase: RuntimeSnapshot["phase"];
      running: boolean;
      startupError?: string | null;
    }>("/v1/runtime/start", {
      method: "POST",
    });
  },
  stopRuntime() {
    return request<{ stopped: true; pid: number | null }>("/v1/runtime/stop", {
      method: "POST",
    });
  },
  probeChannel(channel: ChannelKey, config: Record<string, unknown>) {
    return request<ChannelProbeResult>("/v1/channels/check", {
      method: "POST",
      body: JSON.stringify({ channel, config }),
    });
  },
  diagnostics() {
    return request<BootstrapPayload["diagnostics"]>("/v1/telemetry");
  },
  sessions() {
    return request<BootstrapPayload["sessions"]>("/v1/conversations");
  },
  journal() {
    return request<BootstrapPayload["journal"]>("/v1/journal");
  },
};
