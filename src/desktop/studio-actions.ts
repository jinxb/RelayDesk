import type { Dispatch, SetStateAction } from "react";
import { relaydeskApi } from "../lib/client";
import { desktopBridge, type SidecarSnapshot } from "../lib/desktop";
import type {
  ChannelKey,
  ChannelProbeSnapshot,
  FileConfigModel,
} from "../lib/models";
import { channelDisplayName, resolveWorkspaceForSave } from "./studio-drafts";
import { buildProbeSuccessStatus } from "./probe-status";
import { buildStatus, toErrorMessage } from "./studio-support";
import {
  editWorkspace,
  parseJsonRecord,
  parseWorkspaceSource,
  resolvePreferredWorkdir,
  setPreferredWorkdir,
  stringifyWorkspace,
} from "./workspace";
import type { StudioStatus, StudioTone } from "./types";

const DEFAULT_WORKTREE_PICKER_TITLE = "选择默认工作区";

interface DraftState {
  readonly dirty: boolean;
  readonly rawDraft: boolean;
}

interface BusyTaskOptions {
  readonly busyMessage: string;
  readonly task: () => Promise<void>;
}

interface StudioActionBuilderOptions {
  readonly workspace: FileConfigModel;
  readonly rawEditor: string;
  readonly claudeEnvEditor: string;
  readonly bootstrapAppHome: string | undefined;
  readonly claudeWorkDir: string | undefined;
  readonly draftState: DraftState;
  readonly setBusy: Dispatch<SetStateAction<boolean>>;
  readonly setBusyMessage: Dispatch<SetStateAction<string | null>>;
  readonly setStatus: Dispatch<SetStateAction<StudioStatus>>;
  readonly setWorkspace: Dispatch<SetStateAction<FileConfigModel>>;
  readonly setRawEditor: (value: string) => void;
  readonly setProbeResults: Dispatch<
    SetStateAction<Partial<Record<ChannelKey, ChannelProbeSnapshot>>>
  >;
  readonly setSidecar: Dispatch<SetStateAction<SidecarSnapshot | null>>;
  readonly reloadStudio: (message: string, tone?: StudioTone) => Promise<void>;
}

function readClaudeEnv(claudeEnvEditor: string) {
  return parseJsonRecord(claudeEnvEditor, "Claude 环境变量");
}

function createBusyRunner(options: Pick<StudioActionBuilderOptions, "setBusy" | "setBusyMessage" | "setStatus">) {
  return async function runBusyTask(config: BusyTaskOptions) {
    options.setBusy(true);
    options.setBusyMessage(config.busyMessage);
    options.setStatus(buildStatus(config.busyMessage));
    try {
      await config.task();
    } catch (error) {
      options.setStatus(buildStatus(toErrorMessage(error), "danger"));
    } finally {
      options.setBusy(false);
      options.setBusyMessage(null);
    }
  };
}

export function buildStudioActions(options: StudioActionBuilderOptions) {
  const runBusyTask = createBusyRunner(options);

  async function refresh() {
    await runBusyTask({
      busyMessage: "正在刷新当前状态…",
      task: async () => {
        await options.reloadStudio("已刷新当前状态。");
      },
    });
  }

  async function saveWorkspace() {
    await runBusyTask({
      busyMessage: "正在保存配置…",
      task: async () => {
        const nextWorkspace = resolveWorkspaceForSave({
          workspace: options.workspace,
          rawEditor: options.rawEditor,
          rawDraft: options.draftState.rawDraft,
        });
        const result = await relaydeskApi.saveWorkspace(nextWorkspace, readClaudeEnv(options.claudeEnvEditor));
        const message = result.validation.ok
          ? "配置已保存。"
          : `配置已保存，但仍有 ${result.validation.issues.length} 项需要复核。`;
        await options.reloadStudio(message, result.validation.ok ? "success" : "danger");
      },
    });
  }

  async function validateWorkspace() {
    await runBusyTask({
      busyMessage: "正在校验配置…",
      task: async () => {
        const nextWorkspace = resolveWorkspaceForSave({
          workspace: options.workspace,
          rawEditor: options.rawEditor,
          rawDraft: options.draftState.rawDraft,
        });
        const result = await relaydeskApi.validateWorkspace(nextWorkspace, readClaudeEnv(options.claudeEnvEditor));
        const message = result.ok ? "预检通过，可以启动服务。" : result.issues.join(" | ");
        options.setStatus(buildStatus(message, result.ok ? "success" : "danger"));
      },
    });
  }

  async function startRuntime() {
    await runBusyTask({
      busyMessage: "正在启动服务…",
      task: async () => {
        const nextWorkspace = resolveWorkspaceForSave({
          workspace: options.workspace,
          rawEditor: options.rawEditor,
          rawDraft: options.draftState.rawDraft,
        });
        await relaydeskApi.saveWorkspace(nextWorkspace, readClaudeEnv(options.claudeEnvEditor));
        const result = await relaydeskApi.startRuntime();
        const pidLabel = result.pid ? `（PID ${result.pid}）` : "";
        if (result.phase === "stopped" && result.startupError) {
          throw new Error(`服务启动失败：${result.startupError}`);
        }
        const message = result.phase === "running"
          ? `服务已启动${pidLabel}。`
          : `服务启动中${pidLabel}。`;
        await options.reloadStudio(message, result.phase === "running" ? "success" : "warning");
      },
    });
  }

  async function stopRuntime() {
    await runBusyTask({
      busyMessage: "正在停止服务…",
      task: async () => {
        const result = await relaydeskApi.stopRuntime();
        const message = result.pid
          ? `服务已停止（PID ${result.pid}）。`
          : "服务已停止。";
        await options.reloadStudio(message, "success");
      },
    });
  }

  async function startSidecar() {
    await runBusyTask({
      busyMessage: "正在启动本地桥接…",
      task: async () => {
        await desktopBridge.startSidecar();
        await options.reloadStudio("本地桥接已启动。", "success");
      },
    });
  }

  async function stopSidecar() {
    await runBusyTask({
      busyMessage: "正在停止本地桥接…",
      task: async () => {
        const next = await desktopBridge.stopSidecar();
        options.setSidecar(next);
        options.setStatus(buildStatus("本地桥接已停止。", "success"));
      },
    });
  }

  async function probeChannel(channel: ChannelKey) {
    await runBusyTask({
      busyMessage: `正在检测 ${channelDisplayName(channel)} 连通性…`,
      task: async () => {
        try {
          const result = await relaydeskApi.probeChannel(
            channel,
            options.workspace.platforms?.[channel] ?? {},
          );
          options.setProbeResults((current) => ({
            ...current,
            [channel]: result.probe,
          }));
          const nextStatus = buildProbeSuccessStatus({
            channel,
            channelName: channelDisplayName(channel),
            config: options.workspace.platforms?.[channel],
          });
          options.setStatus(buildStatus(nextStatus.message, nextStatus.tone));
        } catch (error) {
          options.setProbeResults((current) => ({
            ...current,
            [channel]: {
              success: false,
              message: toErrorMessage(error),
              testedAt: new Date().toISOString(),
              stale: false,
            },
          }));
          throw error;
        }
      },
    });
  }

  async function openPath(path: string) {
    await runBusyTask({
      busyMessage: "正在打开系统路径…",
      task: async () => {
        await desktopBridge.openPath(path);
        options.setStatus(buildStatus("已在系统中打开路径。", "success"));
      },
    });
  }

  async function revealPath(path: string) {
    await runBusyTask({
      busyMessage: "正在定位系统路径…",
      task: async () => {
        await desktopBridge.revealPath(path);
        options.setStatus(buildStatus("已在系统中定位该文件。", "success"));
      },
    });
  }

  async function hideWindow() {
    await runBusyTask({
      busyMessage: "正在隐藏窗口…",
      task: async () => {
        await desktopBridge.hideWindow();
        options.setStatus(buildStatus("窗口已隐藏到系统托盘。", "success"));
      },
    });
  }

  async function pickDefaultWorkTree() {
    await runBusyTask({
      busyMessage: "正在选择默认工作区…",
      task: async () => {
        const preferredWorkdir = resolvePreferredWorkdir(options.workspace);
        const selected = await desktopBridge.pickDirectory({
          title: DEFAULT_WORKTREE_PICKER_TITLE,
          startingPath: preferredWorkdir || options.claudeWorkDir || options.bootstrapAppHome || undefined,
        });
        if (!selected) {
          options.setStatus(buildStatus("已取消目录选择。"));
          return;
        }

        options.setWorkspace((current) => editWorkspace(current, (draft) => {
          setPreferredWorkdir(draft, selected);
        }));
        options.setStatus(buildStatus("默认工作区已更新，记得保存配置。", "success"));
      },
    });
  }

  function applyRawEditor() {
    try {
      const next = parseWorkspaceSource(options.rawEditor);
      options.setWorkspace(next);
      options.setRawEditor(stringifyWorkspace(next));
      options.setStatus(buildStatus("已应用原始配置草稿。", "success"));
    } catch (error) {
      options.setStatus(buildStatus(toErrorMessage(error), "danger"));
    }
  }

  function resetRawEditor() {
    options.setRawEditor(stringifyWorkspace(options.workspace));
    options.setStatus(buildStatus("已重置原始配置草稿。", "success"));
  }

  return {
    refresh,
    saveWorkspace,
    validateWorkspace,
    startRuntime,
    stopRuntime,
    startSidecar,
    stopSidecar,
    probeChannel,
    openPath,
    revealPath,
    hideWindow,
    pickDefaultWorkTree,
    applyRawEditor,
    resetRawEditor,
  };
}
