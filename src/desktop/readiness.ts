import type { AgentKey } from "../lib/models";
import { readRuntimeSnapshot } from "./runtime-state";
import type { StudioSnapshot } from "./types";
import { resolvePreferredWorkdir } from "./workspace";

export type ReadinessLevel = "ready" | "attention" | "idle";
export type PathActionKind = "open" | "reveal";

export interface ReadinessItem {
  readonly label: string;
  readonly detail: string;
  readonly level: ReadinessLevel;
}

export interface DesktopPathEntry {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly path: string;
  readonly action: PathActionKind;
}

function toolReady(agent: AgentKey, snapshot: StudioSnapshot) {
  const diagnostics = snapshot.bootstrap?.diagnostics;
  if (!diagnostics) {
    return false;
  }

  if (agent === "claude") return diagnostics.claudeReady;
  if (agent === "codex") return diagnostics.codexReady;
  return diagnostics.codebuddyReady;
}

function enabledChannelDetail(snapshot: StudioSnapshot) {
  if (snapshot.enabledCount === 0) {
    return "当前没有启用任何通讯渠道。";
  }

  if (snapshot.healthyCount === snapshot.enabledCount) {
    return `全部 ${snapshot.enabledCount} 个启用渠道都已具备基础配置。`;
  }

  return `${snapshot.healthyCount}/${snapshot.enabledCount} 个启用渠道已具备基础配置。`;
}

export function buildLaunchChecklist(snapshot: StudioSnapshot): ReadinessItem[] {
  const defaultAgent = snapshot.workspace.aiCommand ?? "claude";
  const runtime = readRuntimeSnapshot(snapshot);
  const sidecarRunning = snapshot.desktopSupported
    ? Boolean(snapshot.sidecar?.running)
    : false;

  return [
    {
      label: "桌面环境",
      detail: snapshot.desktopSupported
        ? "原生托盘、路径操作及目录选择器已激活。"
        : "正在浏览器预览模式下运行。原生桌面操作不可用。",
      level: snapshot.desktopSupported ? "ready" : "idle",
    },
    {
      label: "本地桥接",
      detail: snapshot.desktopSupported
        ? sidecarRunning
          ? "桌面界面已连接到本地桥接服务。"
          : "桌面界面已启动，但本地桥接当前处于离线状态。"
        : "浏览器预览模式下，仅能通过 HTTP 方式访问本地服务。",
      level: snapshot.desktopSupported
        ? sidecarRunning
          ? "ready"
          : "attention"
        : "idle",
    },
    {
      label: "后台服务",
      detail: runtime.phase === "running"
        ? "后台服务正在运行，可以接收聊天平台消息。"
        : runtime.phase === "starting"
          ? "后台服务正在启动，等待渠道与会话初始化完成。"
          : runtime.startupError
            ? `后台服务启动失败：${runtime.startupError}`
            : "后台服务尚未启动。开始远程操作前，请先启动服务。",
      level: runtime.phase === "running" ? "ready" : "attention",
    },
    {
      label: "聊天入口",
      detail: enabledChannelDetail(snapshot),
      level:
        snapshot.enabledCount === 0
          ? "attention"
          : snapshot.healthyCount === snapshot.enabledCount
            ? "ready"
            : "attention",
    },
    {
      label: "默认 AI",
      detail: toolReady(defaultAgent, snapshot)
        ? `${defaultAgent} 已准备好，可以作为默认处理引擎。`
        : `${defaultAgent} 仍需要补齐本机授权或可执行环境。`,
      level: toolReady(defaultAgent, snapshot) ? "ready" : "attention",
    },
  ];
}

export function buildPriorityIssues(snapshot: StudioSnapshot): ReadinessItem[] {
  return buildLaunchChecklist(snapshot).filter((item) => item.level === "attention");
}

export function buildDesktopPathEntries(snapshot: StudioSnapshot): DesktopPathEntry[] {
  const diagnostics = snapshot.bootstrap?.diagnostics;
  const workTree = resolvePreferredWorkdir(snapshot.workspace);

  return [
    {
      id: "work-tree",
      label: "工作区",
      detail: workTree || "未设置",
      path: workTree,
      action: "open",
    },
    {
      id: "app-home",
      label: "应用目录",
      detail: diagnostics?.appHome ?? "不可用",
      path: diagnostics?.appHome ?? "",
      action: "open",
    },
    {
      id: "log-dir",
      label: "日志目录",
      detail: diagnostics?.logDir ?? "不可用",
      path: diagnostics?.logDir ?? "",
      action: "open",
    },
    {
      id: "config-file",
      label: "配置文件",
      detail: diagnostics?.configPath ?? "不可用",
      path: diagnostics?.configPath ?? "",
      action: "reveal",
    },
  ];
}

export function buildToolReadiness(snapshot: StudioSnapshot) {
  return [
    {
      agent: "claude" as const,
      ready: toolReady("claude", snapshot),
      detail: snapshot.bootstrap?.diagnostics.claudeReady
        ? "Claude 已可以直接使用。"
        : "Claude 仍缺少本机凭证或运行环境。",
    },
    {
      agent: "codex" as const,
      ready: toolReady("codex", snapshot),
      detail: snapshot.bootstrap?.diagnostics.codexReady
        ? snapshot.bootstrap?.diagnostics.codexLongPromptReady === false
          ? "Codex 已可直接使用，但长 prompt 需要升级 CLI。"
          : "Codex 已可以直接使用。"
        : snapshot.bootstrap?.diagnostics.codexIssue ?? "Codex 仍缺少 CLI 或本机授权。",
    },
    {
      agent: "codebuddy" as const,
      ready: toolReady("codebuddy", snapshot),
      detail: snapshot.bootstrap?.diagnostics.codebuddyReady
        ? "CodeBuddy 已可以直接使用。"
        : "CodeBuddy 仍缺少本机 CLI。",
    },
  ];
}
