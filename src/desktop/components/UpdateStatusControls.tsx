import { useEffect, useState } from "react";
import { Badge, Button, Tooltip } from "@radix-ui/themes";
import { ArrowUpCircle, DownloadCloud, RefreshCw } from "lucide-react";
import {
  checkForAppUpdate,
  describeUpdaterError,
  type AppUpdateSnapshot,
} from "../../lib/updater";
import type { RelayDeskStudio } from "../types";

interface UpdaterState {
  readonly busy: boolean;
  readonly checked: boolean;
  readonly message: string;
  readonly tone: "gray" | "green" | "amber" | "red";
  readonly update: AppUpdateSnapshot | null;
}

function formatPublishedAt(value: string | undefined) {
  if (!value) {
    return "未知";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("zh-CN", { hour12: false });
}

function statusLabel(state: UpdaterState) {
  if (state.busy) {
    return "检查中";
  }
  if (state.update) {
    return `可更新到 ${state.update.version}`;
  }
  if (!state.checked) {
    return "待检查";
  }
  if (state.tone === "green") {
    return "已是最新";
  }
  if (state.tone === "red") {
    return "更新异常";
  }
  return "待检查";
}

function useUpdaterState(enabled: boolean) {
  const [state, setState] = useState<UpdaterState>({
    busy: false,
    checked: false,
    message: "还没有执行更新检查。",
    tone: "gray",
    update: null,
  });

  async function runCheck() {
    if (!enabled) {
      setState({
        busy: false,
        checked: true,
        message: "浏览器预览模式下不可用。",
        tone: "gray",
        update: null,
      });
      return null;
    }

    setState((current) => ({
      ...current,
      busy: true,
      checked: true,
      message: "正在检查更新…",
      tone: "gray",
      update: null,
    }));

    try {
      const update = await checkForAppUpdate();
      if (!update) {
        setState({
          busy: false,
          checked: true,
          message: "当前已经是最新版本。",
          tone: "green",
          update: null,
        });
        return null;
      }

      const nextMessage = `发现新版本 ${update.version}（当前 ${update.currentVersion}，发布时间 ${formatPublishedAt(update.publishedAt)}）。`;
      setState({
        busy: false,
        checked: true,
        message: nextMessage,
        tone: "amber",
        update,
      });
      return update;
    } catch (error) {
      setState({
        busy: false,
        checked: true,
        message: describeUpdaterError(error),
        tone: "red",
        update: null,
      });
      return null;
    }
  }

  async function installUpdate() {
    if (!state.update || !enabled) {
      return;
    }

    setState((current) => ({
      ...current,
      busy: true,
      message: `正在下载并安装 ${current.update?.version ?? ""}…`,
      tone: "amber",
    }));

    try {
      await state.update.install();
    } catch (error) {
      setState((current) => ({
        ...current,
        busy: false,
        message: describeUpdaterError(error),
        tone: "red",
      }));
    }
  }

  return {
    state,
    runCheck,
    installUpdate,
  };
}

export function OverviewUpdateIndicator({ studio }: { studio: RelayDeskStudio }) {
  const { state, runCheck } = useUpdaterState(studio.snapshot.desktopSupported);

  useEffect(() => {
    void runCheck();
  }, []);

  if (!state.update) {
    return null;
  }

  return (
    <Tooltip content={`发现新版本 ${state.update.version}，打开关于页面处理更新。`}>
      <Button
        variant="soft"
        color="amber"
        size="2"
        onClick={() => {
          window.dispatchEvent(new CustomEvent("relaydesk:open-advanced-about"));
        }}
      >
        <ArrowUpCircle size={16} />
      </Button>
    </Tooltip>
  );
}

export function SettingsUpdateActions({ studio }: { studio: RelayDeskStudio }) {
  const { state, runCheck, installUpdate } = useUpdaterState(studio.snapshot.desktopSupported);

  useEffect(() => {
    void runCheck();
  }, []);

  return (
    <>
      <Badge color={state.tone}>
        {statusLabel(state)}
      </Badge>
      <Tooltip content={state.message}>
        <Button
          variant="soft"
          color="gray"
          size="2"
          onClick={() => void runCheck()}
          disabled={state.busy || !studio.snapshot.desktopSupported}
        >
          <RefreshCw size={16} />
        </Button>
      </Tooltip>
      {state.update ? (
        <Tooltip content={state.message}>
          <Button
            variant="soft"
            color="amber"
            size="2"
            onClick={() => void installUpdate()}
            disabled={state.busy || !studio.snapshot.desktopSupported}
          >
            <DownloadCloud size={16} />
          </Button>
        </Tooltip>
      ) : null}
    </>
  );
}
