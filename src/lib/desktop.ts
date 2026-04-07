export interface ShellIdentity {
  name: string;
  release: string;
}

export interface SidecarSnapshot {
  running: boolean;
  pid: number | null;
}

interface SidecarHttpRequest {
  method: string;
  path: string;
  body?: unknown;
}

interface PathCommandRequest {
  path: string;
}

interface DirectoryPickerRequest {
  title?: string;
  startingPath?: string;
}

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function hasDesktopRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function getInvoke(): Promise<InvokeFn | null> {
  if (!hasDesktopRuntime()) return null;
  const module = await import("@tauri-apps/api/core");
  return module.invoke as InvokeFn;
}

async function getInvokeOrThrow() {
  const invoke = await getInvoke();
  if (!invoke) {
    throw new Error("RelayDesk desktop shell commands are unavailable in browser preview.");
  }
  return invoke;
}

async function getCurrentWindowOrNull() {
  if (!hasDesktopRuntime()) return null;
  const module = await import("@tauri-apps/api/window");
  return module.getCurrentWindow();
}

export const desktopBridge = {
  supported() {
    return hasDesktopRuntime();
  },
  async shellIdentity(): Promise<ShellIdentity | null> {
    const invoke = await getInvoke();
    if (!invoke) return null;
    return invoke<ShellIdentity>("shell_identity");
  },
  async sidecarStatus(): Promise<SidecarSnapshot | null> {
    const invoke = await getInvoke();
    if (!invoke) return null;
    return invoke<SidecarSnapshot>("sidecar_status");
  },
  async startSidecar(): Promise<SidecarSnapshot | null> {
    const invoke = await getInvoke();
    if (!invoke) return null;
    return invoke<SidecarSnapshot>("sidecar_launch");
  },
  async stopSidecar(): Promise<SidecarSnapshot | null> {
    const invoke = await getInvoke();
    if (!invoke) return null;
    return invoke<SidecarSnapshot>("sidecar_halt");
  },
  async requestSidecar<T>(request: SidecarHttpRequest): Promise<T> {
    const invoke = await getInvokeOrThrow();
    return invoke<T>("sidecar_request", { request });
  },
  async hideWindow(): Promise<void> {
    const invoke = await getInvokeOrThrow();
    await invoke("window_hide");
  },
  async showWindow(): Promise<void> {
    const invoke = await getInvokeOrThrow();
    await invoke("window_show");
  },
  async startWindowDrag(): Promise<void> {
    const currentWindow = await getCurrentWindowOrNull();
    if (!currentWindow) return;
    await currentWindow.startDragging();
  },
  async openPath(path: string): Promise<void> {
    const invoke = await getInvokeOrThrow();
    await invoke("open_path", {
      request: { path } satisfies PathCommandRequest,
    });
  },
  async revealPath(path: string): Promise<void> {
    const invoke = await getInvokeOrThrow();
    await invoke("reveal_path", {
      request: { path } satisfies PathCommandRequest,
    });
  },
  async pickDirectory(request: DirectoryPickerRequest = {}): Promise<string | null> {
    const invoke = await getInvokeOrThrow();
    return invoke<string | null>("pick_directory", { request });
  },
};
