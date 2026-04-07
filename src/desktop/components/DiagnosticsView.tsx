import { Badge, Button, Flex, Text } from "@radix-ui/themes";
import { buildProbeResultText, channelHint, channelLabel, channelTone } from "../channel-probe-state";
import { channelDefinitions } from "../catalog";
import { buildDesktopPathEntries, buildPriorityIssues, type DesktopPathEntry } from "../readiness";
import { PageTopline } from "./PageTopline";
import { DiagnosticsJournalCard } from "./DiagnosticsJournalCard";
import type { RelayDeskStudio } from "../types";

interface DiagnosticsViewProps {
  readonly studio: RelayDeskStudio;
}

function issueTarget(studio: RelayDeskStudio, label: string, detail: string) {
  const source = `${label} ${detail}`.toLowerCase();

  if (source.includes("渠道") || source.includes("telegram") || source.includes("feishu") || source.includes("wechat") || source.includes("dingtalk")) {
    return { label: "去连接页", run: () => studio.actions.setCurrentView("connection" as const) };
  }
  if (source.includes("claude") || source.includes("codex") || source.includes("codebuddy") || source.includes("工作区") || source.includes("路由")) {
    return { label: "去 AI 页", run: () => studio.actions.setCurrentView("ai" as const) };
  }
  return { label: "保持当前页", run: () => undefined };
}

function runPathAction(studio: RelayDeskStudio, entry: DesktopPathEntry) {
  return entry.action === "open" ? studio.actions.openPath(entry.path) : studio.actions.revealPath(entry.path);
}

function probeFailed(message: string | undefined, stale: boolean | undefined) {
  if (!message) return false;
  if (stale) return false;
  return /失败|error|invalid|denied|timeout|required|缺少|未填写|异常/i.test(message);
}

function diagnosticChannels(studio: RelayDeskStudio) {
  return channelDefinitions.flatMap((channel) => {
    const health = studio.snapshot.bootstrap?.health[channel.key];
    const enabled = Boolean(studio.snapshot.workspace.platforms?.[channel.key]?.enabled);
    const probe = studio.snapshot.probeResults[channel.key];
    const probeResult = buildProbeResultText(probe);
    const tone = channelTone(health, enabled, probe);
    if (tone === "green" || tone === "gray") return [];
    const detail = probeFailed(probeResult, probe?.stale)
      ? probeResult ?? channelHint(health, enabled, probe)
      : channelHint(health, enabled, probe);
    return [{ key: channel.key, title: channel.title, detail, label: channelLabel(health, enabled, probe), tone }];
  });
}

/* ── Top: Quick Actions + Issue count ── */

function ActionBar({ studio, entries, issueCount }: {
  studio: RelayDeskStudio;
  entries: readonly DesktopPathEntry[];
  issueCount: number;
}) {
  const nativeEnabled = studio.snapshot.desktopSupported;
  const title = issueCount > 0 ? `${issueCount} 项需要处理` : "当前无阻塞项";
  if (!nativeEnabled) return null;

  return (
    <section className="relaydesk-dashCard relaydesk-diagnosticsActionBar">
      <Flex justify="between" align="center" gap="3" wrap="wrap">
        <Text size="3" weight="bold">{title}</Text>
        <Flex gap="2" wrap="wrap">
          {entries.map((entry) => (
            <Button key={entry.id} size="1" variant="soft" onClick={() => void runPathAction(studio, entry)} disabled={studio.snapshot.busy || !nativeEnabled || !entry.path}>
              {entry.label}
            </Button>
          ))}
        </Flex>
      </Flex>
    </section>
  );
}

/* ── Issues list ── */

function IssuesList({
  issues,
  studio,
}: {
  issues: ReturnType<typeof buildPriorityIssues>;
  studio: RelayDeskStudio;
}) {
  if (issues.length === 0) return null;

  return (
    <section className="relaydesk-dashCard relaydesk-diagnosticsPanel relaydesk-diagnosticsPanel--issues">
      <Text size="2" weight="bold">问题摘要</Text>
      <div className="relaydesk-diagnosticList relaydesk-diagnosticList--summary">
        {issues.map((item) => (
          <div key={item.label} className="relaydesk-diagnosticListItem">
            <div className="relaydesk-diagnosticListMeta">
              <Text weight="medium">{item.label}</Text>
              <Text size="2" color="gray">{item.detail}</Text>
            </div>
            <Button size="1" variant="soft" color="gray" onClick={() => issueTarget(studio, item.label, item.detail).run()}>
              {issueTarget(studio, item.label, item.detail).label}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Channel health (only problematic) ── */

function ChannelAlerts({
  channels,
}: {
  channels: ReturnType<typeof diagnosticChannels>;
}) {
  if (channels.length === 0) return null;

  return (
    <section className="relaydesk-dashCard relaydesk-diagnosticsPanel relaydesk-diagnosticsPanel--alerts">
      <Text size="2" weight="bold">{channels.length} 个渠道需要关注</Text>
      <div className="relaydesk-diagnosticHealthList relaydesk-diagnosticHealthList--scroll">
        {channels.map((channel) => (
          <div key={channel.key} className="relaydesk-diagnosticHealthRow">
            <div className="relaydesk-diagnosticHealthMeta">
              <Text weight="medium">{channel.title}</Text>
              <Text size="2" color="gray">{channel.detail}</Text>
            </div>
            <Badge color={channel.tone}>{channel.label}</Badge>
          </div>
        ))}
      </div>
    </section>
  );
}

export function DiagnosticsView({ studio }: DiagnosticsViewProps) {
  const issues = buildPriorityIssues(studio.snapshot);
  const channels = diagnosticChannels(studio);
  const pathEntries = buildDesktopPathEntries(studio.snapshot);
  const hasSidebar = issues.length > 0 || channels.length > 0;

  return (
    <Flex direction="column" className="relaydesk-pageSection relaydesk-pageSection--fill">
      <PageTopline title="诊断" summary="阻塞问题与运行日志" />
      <ActionBar studio={studio} entries={pathEntries} issueCount={issues.length} />
      <div className="relaydesk-diagnosticsLayout" data-sidebar={hasSidebar ? "true" : "false"}>
        {hasSidebar ? (
          <div className="relaydesk-diagnosticsSidebar">
            <IssuesList issues={issues} studio={studio} />
            <ChannelAlerts channels={channels} />
          </div>
        ) : null}
        <div className="relaydesk-diagnosticsMain">
          <DiagnosticsJournalCard studio={studio} />
        </div>
      </div>
    </Flex>
  );
}
