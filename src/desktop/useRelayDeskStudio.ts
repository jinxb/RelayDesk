import { useEffect, useMemo, useState } from "react";
import { desktopBridge, type ShellIdentity, type SidecarSnapshot } from "../lib/desktop";
import { relaydeskApi } from "../lib/client";
import type {
  BootstrapPayload,
  ChannelKey,
  ChannelProbeSnapshot,
  FileConfigModel,
} from "../lib/models";
import { buildStudioActions } from "./studio-actions";
import { buildDraftState } from "./studio-drafts";
import {
  bootstrapWithRecovery,
  buildStatus,
  toErrorMessage,
  normalizeBootstrapPayload,
  readDesktopSnapshot,
  shouldShowSetupWizard,
} from "./studio-support";
import { useDiagnosticsJournal } from "./useDiagnosticsJournal";
import { readRuntimeSnapshot } from "./runtime-state";
import type { RelayDeskStudio, StudioStatus, StudioTone, StudioViewKey } from "./types";
import { editWorkspace, normalizeWorkspace, stringifyWorkspace } from "./workspace";

const INITIAL_VIEW: StudioViewKey = "console";
const STARTUP_POLL_INTERVAL_MS = 800;
const STARTUP_STALL_TIMEOUT_MS = 15000;
const INITIAL_STATUS: StudioStatus = {
  message: "正在连接 RelayDesk...",
  tone: "neutral",
};

function buildInitialWorkspace() {
  return normalizeWorkspace(undefined);
}

function useWorkspaceState() {
  const initialWorkspace = buildInitialWorkspace();
  const [workspace, setWorkspace] = useState<FileConfigModel>(() => initialWorkspace);
  const [rawEditor, setRawEditor] = useState(() => stringifyWorkspace(initialWorkspace));
  const [rawDraft, setRawDraft] = useState(false);

  function syncRawEditor(next: string | ((current: string) => string)) {
    setRawEditor(next);
    setRawDraft(false);
  }

  function editRawEditor(next: string) {
    setRawEditor(next);
    setRawDraft(true);
  }

  return {
    workspace,
    setWorkspace,
    rawEditor,
    rawDraft,
    syncRawEditor,
    editRawEditor,
  };
}

export function useRelayDeskStudio(): RelayDeskStudio {
  const [currentView, setCurrentView] = useState<StudioViewKey>(INITIAL_VIEW);
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const diagnosticsJournal = useDiagnosticsJournal(currentView);
  const {
    workspace,
    setWorkspace,
    rawEditor,
    rawDraft,
    syncRawEditor,
    editRawEditor,
  } = useWorkspaceState();
  const [claudeEnvEditor, setClaudeEnvEditor] = useState("{}");
  const [probeResults, setProbeResults] = useState<
    Partial<Record<ChannelKey, ChannelProbeSnapshot>>
  >({});
  const [shellIdentity, setShellIdentity] = useState<ShellIdentity | null>(null);
  const [sidecar, setSidecar] = useState<SidecarSnapshot | null>(null);
  const [status, setStatus] = useState<StudioStatus>(INITIAL_STATUS);
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [startupPhaseSince, setStartupPhaseSince] = useState<number | null>(null);
  const desktopSupported = desktopBridge.supported();
  const enabledCount = useMemo(() => {
    return Object.values(workspace.platforms ?? {}).filter((entry) => entry?.enabled).length;
  }, [workspace]);
  const healthyCount = useMemo(() => {
    return Object.values(bootstrap?.health ?? {}).filter((entry) => entry.healthy).length;
  }, [bootstrap]);
  const draftState = useMemo(() => {
    return buildDraftState({
      bootstrap,
      workspace,
      claudeEnvEditor,
      rawDraft,
    });
  }, [bootstrap, workspace, claudeEnvEditor, rawDraft]);

  function updateWorkspace(recipe: (draft: FileConfigModel) => void) {
    setWorkspace((current) => editWorkspace(current, recipe));
  }

  function commitBootstrap(payload: BootstrapPayload, syncEditors = true) {
    setBootstrap(payload);
    diagnosticsJournal.hydrateJournal(payload.journal);
    setProbeResults(payload.probes ?? {});
    if (!syncEditors) {
      return;
    }

    const normalized = normalizeBootstrapPayload(payload);
    setWorkspace(normalized.workspace);
    syncRawEditor(normalized.rawEditor);
    setClaudeEnvEditor(normalized.claudeEnvEditor);
  }

  async function reloadStudio(message: string, tone: StudioTone = "neutral") {
    const result = await bootstrapWithRecovery();
    commitBootstrap(result.payload);
    const desktop = await readDesktopSnapshot();
    setShellIdentity(desktop.identity);
    setSidecar(desktop.sidecar);
    setIsFirstTime(shouldShowSetupWizard(result.payload));

    if (result.recovered) {
      setStatus(buildStatus("本地桥接服务已连接。", "success"));
      return;
    }

    const runtime = readRuntimeSnapshot({ bootstrap: result.payload });
    if (runtime.phase === "starting") {
      const pidLabel = runtime.pid ? `（PID ${runtime.pid}）` : "";
      setStatus(buildStatus(`服务启动中${pidLabel}。`, "warning"));
      return;
    }
    if (runtime.phase === "stopped" && runtime.startupError) {
      setStatus(buildStatus(`服务启动失败：${runtime.startupError}`, "danger"));
      return;
    }

    setStatus(buildStatus(message, tone));
  }

  const actionBundle = buildStudioActions({
    workspace,
    rawEditor,
    claudeEnvEditor,
    bootstrapAppHome: bootstrap?.diagnostics.appHome,
    claudeWorkDir: workspace.tools?.claude?.workDir,
    draftState,
    setBusy,
    setBusyMessage,
    setStatus,
    setWorkspace,
    setRawEditor: syncRawEditor,
    setProbeResults,
    setSidecar,
    reloadStudio,
  });

  useEffect(() => {
    void actionBundle.refresh();
  }, []);

  useEffect(() => {
    const shouldWarn = draftState.dirty || draftState.rawDraft;
    if (!shouldWarn) {
      return undefined;
    }

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [draftState.dirty, draftState.rawDraft]);

  useEffect(() => {
    if (draftState.rawDraft) {
      return;
    }

    syncRawEditor(stringifyWorkspace(workspace));
  }, [workspace, draftState.rawDraft]);

  useEffect(() => {
    const runtime = readRuntimeSnapshot({ bootstrap });
    if (runtime.phase === "starting") {
      setStartupPhaseSince((current) => current ?? Date.now());
      return undefined;
    }

    setStartupPhaseSince(null);
    return undefined;
  }, [bootstrap?.runtime.phase]);

  useEffect(() => {
    const runtime = readRuntimeSnapshot({ bootstrap });
    if (runtime.phase !== "starting") {
      return undefined;
    }

    let cancelled = false;
    let timer: ReturnType<typeof window.setTimeout> | null = null;

    async function pollStartup() {
      try {
        const payload = await relaydeskApi.bootstrap();
        if (cancelled) return;
        commitBootstrap(payload, false);
        const nextRuntime = payload.runtime;
        if (nextRuntime.phase === "running") {
          const pidLabel = nextRuntime.pid ? `（PID ${nextRuntime.pid}）` : "";
          setStatus(buildStatus(`服务已启动${pidLabel}。`, "success"));
          return;
        }
        if (nextRuntime.phase === "stopped" && nextRuntime.startupError) {
          setStatus(buildStatus(`服务启动失败：${nextRuntime.startupError}`, "danger"));
          return;
        }
        timer = window.setTimeout(() => {
          void pollStartup();
        }, STARTUP_POLL_INTERVAL_MS);
      } catch (error) {
        if (cancelled) return;
        setStatus(buildStatus(toErrorMessage(error), "danger"));
      }
    }

    timer = window.setTimeout(() => {
      void pollStartup();
    }, STARTUP_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [bootstrap?.runtime.phase, bootstrap?.runtime.pid]);

  useEffect(() => {
    if (startupPhaseSince === null) {
      return undefined;
    }

    const elapsedMs = Date.now() - startupPhaseSince;
    const remainingMs = Math.max(STARTUP_STALL_TIMEOUT_MS - elapsedMs, 0);
    const timer = window.setTimeout(() => {
      const runtime = readRuntimeSnapshot({ bootstrap });
      if (runtime.phase !== "starting") {
        return;
      }
      const pidLabel = runtime.pid ? `（PID ${runtime.pid}）` : "";
      setStatus(buildStatus(`服务启动超时${pidLabel}，可点击“停止启动”后查看诊断日志。`, "danger"));
    }, remainingMs);

    return () => window.clearTimeout(timer);
  }, [startupPhaseSince, bootstrap?.runtime.phase, bootstrap?.runtime.pid]);

  return {
    currentView,
    snapshot: {
      bootstrap,
      journal: diagnosticsJournal.journal,
      journalBusy: diagnosticsJournal.journalBusy,
      journalError: diagnosticsJournal.journalError,
      workspace,
      claudeEnvEditor,
      rawEditor,
      probeResults,
      shellIdentity,
      sidecar,
      desktopSupported,
      isFirstTime,
      loading: bootstrap === null,
      busy,
      busyMessage,
      dirty: draftState.dirty,
      rawDraft: draftState.rawDraft,
      status,
      enabledCount,
      healthyCount,
    },
    actions: {
      setCurrentView,
      updateWorkspace,
      setClaudeEnvEditor,
      setRawEditor: editRawEditor,
      refreshJournal: diagnosticsJournal.refreshJournal,
      ...actionBundle,
    },
  };
}
