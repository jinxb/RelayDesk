import type { ShellIdentity, SidecarSnapshot } from "../lib/desktop";
import type {
  BootstrapPayload,
  ChannelKey,
  ChannelProbeSnapshot,
  FileConfigModel,
} from "../lib/models";

export type StudioViewKey =
  | "console"
  | "connection"
  | "ai"
  | "sessions"
  | "diagnosis";

export type StudioTone = "neutral" | "success" | "warning" | "danger";

export interface StudioStatus {
  readonly message: string;
  readonly tone: StudioTone;
}

export interface StudioSnapshot {
  readonly bootstrap: BootstrapPayload | null;
  readonly journal?: BootstrapPayload["journal"] | null;
  readonly journalBusy?: boolean;
  readonly journalError?: string | null;
  readonly workspace: FileConfigModel;
  readonly claudeEnvEditor: string;
  readonly rawEditor: string;
  readonly probeResults: Partial<Record<ChannelKey, ChannelProbeSnapshot>>;
  readonly shellIdentity: ShellIdentity | null;
  readonly sidecar: SidecarSnapshot | null;
  readonly desktopSupported: boolean;
  readonly isFirstTime: boolean;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly busyMessage: string | null;
  readonly dirty: boolean;
  readonly rawDraft: boolean;
  readonly status: StudioStatus;
  readonly enabledCount: number;
  readonly healthyCount: number;
}

export interface StudioActions {
  readonly setCurrentView: (view: StudioViewKey) => void;
  readonly updateWorkspace: (recipe: (draft: FileConfigModel) => void) => void;
  readonly setClaudeEnvEditor: (value: string) => void;
  readonly setRawEditor: (value: string) => void;
  readonly refresh: () => Promise<void>;
  readonly refreshJournal?: () => Promise<void>;
  readonly saveWorkspace: () => Promise<void>;
  readonly validateWorkspace: () => Promise<void>;
  readonly startRuntime: () => Promise<void>;
  readonly stopRuntime: () => Promise<void>;
  readonly startSidecar: () => Promise<void>;
  readonly stopSidecar: () => Promise<void>;
  readonly probeChannel: (channel: ChannelKey) => Promise<void>;
  readonly openPath: (path: string) => Promise<void>;
  readonly revealPath: (path: string) => Promise<void>;
  readonly hideWindow: () => Promise<void>;
  readonly pickDefaultWorkTree: () => Promise<void>;
  readonly applyRawEditor: () => void;
  readonly resetRawEditor: () => void;
}

export interface RelayDeskStudio {
  readonly currentView: StudioViewKey;
  readonly snapshot: StudioSnapshot;
  readonly actions: StudioActions;
}
