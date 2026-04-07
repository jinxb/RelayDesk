import { Badge, Button, Flex, Text, Tooltip } from "@radix-ui/themes";
import { ArrowUpRight, FileText, FolderOpen, Route } from "lucide-react";
import type { RelayDeskStudio } from "../types";
import type { OverviewChannel, OverviewViewModel } from "./overview-model";
import { buildSessionManagementEntries } from "./session-management-model";

function displayAgentName(agent: string) {
  if (agent === "codex") return "Codex";
  if (agent === "claude") return "Claude Code";
  if (agent === "codebuddy") return "CodeBuddy";
  return agent;
}

function workdirName(path: string) {
  const normalized = path.replace(/[/\\]+$/, "");
  const parts = normalized.split(/[/\\]/).filter(Boolean);
  return parts.at(-1) || path;
}

function statusTone(channel: OverviewChannel) {
  if (channel.state.tone === "green") return "success";
  if (channel.state.tone === "amber") return "warning";
  if (channel.state.tone === "red") return "danger";
  return "idle";
}

function StatusPill({ channel }: { channel: OverviewChannel }) {
  return (
    <span className="relaydesk-statusPill" data-tone={statusTone(channel)}>
      {channel.state.label}
    </span>
  );
}

function ActiveIndicator() {
  return (
    <Tooltip content="当前存在活跃会话">
      <span className="relaydesk-activeFlag" aria-label="当前存在活跃会话">
        <span className="relaydesk-statusDot relaydesk-statusDot--active" />
      </span>
    </Tooltip>
  );
}

function PipelineSingleSummary({ channel }: { channel: OverviewChannel }) {
  return (
    <div className="relaydesk-pipelineRow--single" data-tone={channel.state.tone}>
      <div className="relaydesk-pipelineHeader">
        <div className="relaydesk-pipelineIdentity">
          <span className="relaydesk-pipelineTitle">{channel.title}</span>
          <span className="relaydesk-agentTag">{displayAgentName(channel.agent)}</span>
        </div>
        <div className="relaydesk-tileStatusRow">
          {channel.active ? <ActiveIndicator /> : null}
          <StatusPill channel={channel} />
        </div>
      </div>
      <Text size="2" className="relaydesk-pipelineSummaryText">
        {channel.summary}
      </Text>
      <div className="relaydesk-pipelineMetaRow">
        <span className="relaydesk-pipelineMetaChip">
          {channel.workdir.currentPath ? "当前目录" : "默认工作区"}
        </span>
        <Text className="relaydesk-pathMono">{channel.workdir.currentPath || channel.workdir.defaultPath}</Text>
      </div>
    </div>
  );
}

function PipelineGridTile({ channel }: { channel: OverviewChannel }) {
  return (
    <div className="relaydesk-pipelineTile" data-tone={channel.state.tone}>
      <div className="relaydesk-tileHeader">
        <div className="relaydesk-tileIdentity">
          <span className="relaydesk-tileTitle">{channel.title}</span>
          <span className="relaydesk-agentTag">{displayAgentName(channel.agent)}</span>
        </div>
        <div className="relaydesk-tileStatusRow">
          {channel.active ? <ActiveIndicator /> : null}
          <StatusPill channel={channel} />
        </div>
      </div>
      <div className="relaydesk-tileSummary">{channel.summary}</div>
      <div className="relaydesk-tileMeta">
        <span>{channel.workdir.currentPath ? "当前目录" : "默认工作区"}</span>
        <span className="relaydesk-pathMono">{channel.workdir.currentPath || channel.workdir.defaultPath}</span>
      </div>
    </div>
  );
}

function PipelineListRow({ channel }: { channel: OverviewChannel }) {
  return (
    <div className="relaydesk-pipelineListRow" data-tone={channel.state.tone}>
      <div className="relaydesk-pipelineListMain">
        <div className="relaydesk-pipelineListIdentity">
          <span className="relaydesk-tileTitle">{channel.title}</span>
        </div>
        <span className="relaydesk-pipelineListSummary">{channel.summary}</span>
      </div>
      <div className="relaydesk-pipelineListMeta">
        {channel.active ? <ActiveIndicator /> : null}
        <StatusPill channel={channel} />
        <span className="relaydesk-agentTag">{displayAgentName(channel.agent)}</span>
      </div>
    </div>
  );
}

function PipelineSummary({ model }: { model: OverviewViewModel }) {
  const channels = model.summaryChannels;
  if (channels.length === 1) {
    return <PipelineSingleSummary channel={channels[0]} />;
  }

  if (channels.length >= 3) {
    return (
      <div className="relaydesk-pipelineList">
        {channels.map((channel) => (
          <PipelineListRow key={channel.key} channel={channel} />
        ))}
      </div>
    );
  }

  return (
    <div className="relaydesk-pipelineGrid">
      {channels.map((channel) => (
        <PipelineGridTile key={channel.key} channel={channel} />
      ))}
    </div>
  );
}

export function PipelineCard({ model }: { model: OverviewViewModel }) {
  const badgeLabel = model.running ? "运行中" : model.starting ? "启动中" : "未启动";
  const badgeColor = model.running ? "green" : model.starting ? "amber" : "gray";
  return (
    <section className="relaydesk-dashCard relaydesk-dashCard--pipeline">
      <div className="relaydesk-dashCardHeader">
        <div className="relaydesk-dashCardTitle">
          <Route size={15} />
          <span>当前链路</span>
        </div>
        <Badge size="1" variant="soft" color={badgeColor}>
          {badgeLabel}
        </Badge>
      </div>
      <div className="relaydesk-pipelineBody">
        <PipelineSummary model={model} />
      </div>
    </section>
  );
}

export function OverviewStatusStrip({
  bridgeOnline,
  model,
}: {
  bridgeOnline: boolean;
  model: OverviewViewModel;
}) {
  const chips = [
    {
      key: "runtime",
      value: model.running ? "服务运行中" : model.starting ? "服务启动中" : "服务未启动",
      tone: model.running ? "success" as const : "warning" as const,
    },
    {
      key: "bridge",
      value: bridgeOnline ? "桥接已连接" : "桥接未连接",
      tone: bridgeOnline ? "success" as const : "warning" as const,
    },
    {
      key: "channels",
      value: `${model.channelStatus.label}：${model.channelStatus.value}`,
      tone: model.channelStatus.tone,
    },
  ];

  return (
    <section className="relaydesk-overviewStatusStrip">
      <div className="relaydesk-overviewStatusChips">
        {chips.map((chip) => (
          <span key={chip.key} className="relaydesk-overviewStatusChip" data-tone={chip.tone}>
            {chip.value}
          </span>
        ))}
      </div>
    </section>
  );
}

export function SessionDetailsCard({
  studio,
}: {
  studio: RelayDeskStudio;
}) {
  const sessions = buildSessionManagementEntries(studio).slice(0, 5);

  return (
    <section className="relaydesk-dashCard relaydesk-dashCard--workspace">
      <div className="relaydesk-dashCardHeader">
        <div className="relaydesk-dashCardTitle">
          <FolderOpen size={15} />
          <span>最近会话</span>
        </div>
        <Button
          variant="ghost"
          color="gray"
          size="1"
          onClick={() => studio.actions.setCurrentView("sessions")}
          aria-label="展开会话管理"
        >
          <ArrowUpRight size={15} />
        </Button>
      </div>
      {sessions.length > 0 ? (
        <div className="relaydesk-sessionRecent">
          <div className="relaydesk-sessionRecentHeaderRow" aria-hidden="true">
            <span>平台</span>
            <span>AI</span>
            <span>目录</span>
            <span>会话时间</span>
          </div>
          <div className="relaydesk-sessionRecentList relaydesk-sessionRecentList--full">
            {sessions.map((session) => (
              <div key={session.key} className="relaydesk-sessionRecentRow">
                <span className="relaydesk-sessionRecentTitle">{session.platformLabel}</span>
                <span className="relaydesk-agentTag relaydesk-sessionRecentAgent">{displayAgentName(session.agentValue)}</span>
                <span className="relaydesk-sessionRecentDirName" title={session.workDir}>{workdirName(session.workDir)}</span>
                <span className="relaydesk-sessionMetaChip">{session.updatedAtLabel}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="relaydesk-sessionEmptyState">
          <FolderOpen size={18} />
          <div className="relaydesk-sessionEmptyCopy">
            <Text size="2" weight="medium">还没有会话记录</Text>
            <Text size="2" color="gray">首次收到对话后，这里会显示最近 5 条摘要。</Text>
          </div>
        </div>
      )}
    </section>
  );
}

export function LogCard({
  model,
  onOpenDiagnosis,
}: {
  model: OverviewViewModel;
  onOpenDiagnosis: () => void;
}) {
  return (
    <section className="relaydesk-dashCard relaydesk-dashCard--log">
      <div className="relaydesk-dashCardHeader">
        <div className="relaydesk-dashCardTitle">
          <FileText size={15} />
          <span>运行日志</span>
        </div>
        <Button variant="ghost" color="gray" size="1" onClick={onOpenDiagnosis}>
          详细诊断
        </Button>
      </div>
      <div className="relaydesk-logEntries">
        {model.log.lines.length > 0 ? (
          model.log.lines.map((entry) => (
              <div key={`${entry.time}-${entry.detail}`} className="relaydesk-logRow" data-tone={entry.tone}>
                <span className="relaydesk-logTime">{entry.time}</span>
                <Text size="1" color="gray" className="relaydesk-logText">
                  {entry.detail}
                </Text>
              </div>
          ))
        ) : (
          <Flex align="center" justify="center" style={{ height: "100%" }}>
            <Text size="1" color="gray">等待服务启动后记录运行轨迹...</Text>
          </Flex>
        )}
      </div>
      <Text size="1" color="gray" className="relaydesk-cardFooterText">
        {model.log.file === "暂无运行日志" ? "展示最新日志摘要。" : `来源：${model.log.file}`}
      </Text>
    </section>
  );
}
