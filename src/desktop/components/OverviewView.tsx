import { Button, Flex, Tooltip } from "@radix-ui/themes";
import {
  CirclePlay,
  EyeOff,
  Pause,
  RefreshCw,
} from "lucide-react";
import type { RelayDeskStudio } from "../types";
import { buildOverviewModel } from "./overview-model";
import type { OverviewViewModel } from "./overview-model";
import {
  LogCard,
  OverviewStatusStrip,
  PipelineCard,
  SessionDetailsCard,
} from "./OverviewDashboardCards";
import { PageTopline } from "./PageTopline";
import { OverviewUpdateIndicator } from "./UpdateStatusControls";

interface OverviewViewProps {
  readonly studio: RelayDeskStudio;
}

function OverviewHeaderActions({
  studio,
}: {
  studio: RelayDeskStudio;
}) {
  return (
    <>
      <Tooltip content="刷新状态">
        <Button variant="soft" color="gray" size="2" onClick={() => void studio.actions.refresh()} disabled={studio.snapshot.busy}>
          <RefreshCw size={16} />
        </Button>
      </Tooltip>
      <OverviewUpdateIndicator studio={studio} />
      {studio.snapshot.desktopSupported ? (
        <Tooltip content="隐藏到托盘">
          <Button variant="soft" color="gray" size="2" onClick={() => void studio.actions.hideWindow()}>
            <EyeOff size={16} />
          </Button>
        </Tooltip>
      ) : null}
    </>
  );
}

function ServiceControlButton({
  studio,
  model,
}: {
  studio: RelayDeskStudio;
  model: OverviewViewModel;
}) {
  const disabled = studio.snapshot.busy;
  const actionLabel = model.running ? "停止服务" : model.starting ? "停止启动" : "启动服务";

  return (
    <button
      type="button"
      className="relaydesk-runtimeActionButton"
      data-running={model.running}
      data-starting={model.starting}
      disabled={disabled}
      onClick={() => void ((model.running || model.starting) ? studio.actions.stopRuntime() : studio.actions.startRuntime())}
    >
      {model.running ? <Pause size={18} /> : model.starting ? <RefreshCw size={18} className="relaydesk-spin" /> : <CirclePlay size={18} />}
      <span>{actionLabel}</span>
    </button>
  );
}

/* ── Root ── */

export function OverviewView({ studio }: OverviewViewProps) {
  const model = buildOverviewModel(studio);
  const bridgeOnline = studio.snapshot.sidecar?.running ?? false;
  const compactSecondaryCards = model.summaryChannels.length > 4;

  return (
    <Flex direction="column" className="relaydesk-pageSection relaydesk-pageSection--fill relaydesk-pageSection--overview">
      <PageTopline
        title="控制台"
        actions={<OverviewHeaderActions studio={studio} />}
      />
      <OverviewStatusStrip
        bridgeOnline={bridgeOnline}
        model={model}
      />

      <div
        className="relaydesk-consoleView"
        data-compact-secondary-cards={compactSecondaryCards ? "true" : "false"}
      >
        <div className="relaydesk-consoleDashboard">
          <PipelineCard model={model} />
          <SessionDetailsCard studio={studio} />
          <LogCard model={model} onOpenDiagnosis={() => studio.actions.setCurrentView("diagnosis")} />
        </div>
        <div className="relaydesk-consoleFloatingAction">
          <ServiceControlButton studio={studio} model={model} />
        </div>
      </div>
    </Flex>
  );
}
