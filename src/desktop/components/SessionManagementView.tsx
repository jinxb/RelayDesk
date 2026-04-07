import { Button, Flex, Text } from "@radix-ui/themes";
import { ArrowLeft, ArrowUpRight, Copy, FolderOpen, History, MessageSquareText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { RelayDeskStudio } from "../types";
import { PageTopline } from "./PageTopline";
import { buildSessionManagementEntries } from "./session-management-model";

interface SessionManagementViewProps {
  readonly studio: RelayDeskStudio;
}

function displayAgentName(agent: string) {
  if (agent === "codex") return "Codex";
  if (agent === "claude") return "Claude Code";
  if (agent === "codebuddy") return "CodeBuddy";
  return agent;
}

async function copyText(value: string) {
  if (!navigator.clipboard?.writeText) {
    return;
  }

  await navigator.clipboard.writeText(value);
}

function SessionList({
  selectedKey,
  sessions,
  onSelect,
}: {
  selectedKey: string | null;
  sessions: ReturnType<typeof buildSessionManagementEntries>;
  onSelect: (key: string) => void;
}) {
  return (
    <section className="relaydesk-dashCard relaydesk-sessionPagePanel relaydesk-sessionPagePanel--list">
      <div className="relaydesk-sessionPagePanelHeader">
        <Text size="3" weight="bold">会话列表</Text>
        <span className="relaydesk-sessionPageCount">{sessions.length}</span>
      </div>
      <div className="relaydesk-sessionPageList">
        {sessions.map((session) => (
          <button
            key={session.key}
            type="button"
            className="relaydesk-sessionListItem"
            data-active={selectedKey === session.key ? "true" : "false"}
            onClick={() => onSelect(session.key)}
          >
            <div className="relaydesk-sessionListItemMain">
              <div className="relaydesk-sessionListItemTitleRow">
                <Text weight="medium">{session.platformLabel}</Text>
                <span className="relaydesk-agentTag">{displayAgentName(session.agentValue)}</span>
                {session.isPrimary ? <span className="relaydesk-sessionListBadge">当前</span> : null}
              </div>
              <Text size="2" color="gray" className="relaydesk-sessionListItemMeta">
                {session.updatedAtLabel}
              </Text>
            </div>
            <span className="relaydesk-sessionListChevron" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function SessionDetail({
  studio,
  session,
}: {
  studio: RelayDeskStudio;
  session: ReturnType<typeof buildSessionManagementEntries>[number] | undefined;
}) {
  if (!session) {
    return (
      <section className="relaydesk-dashCard relaydesk-sessionPagePanel relaydesk-sessionPagePanel--detail">
        <Flex align="center" justify="center" className="relaydesk-cardBody">
          <Text size="2" color="gray">暂无可展示的会话</Text>
        </Flex>
      </section>
    );
  }

  return (
    <section className="relaydesk-dashCard relaydesk-sessionPagePanel relaydesk-sessionPagePanel--detail">
      <div className="relaydesk-sessionDetailHero">
        <div className="relaydesk-sessionDetailIdentity">
          <div className="relaydesk-sessionDetailTitleRow">
            <Text size="5" weight="bold">{session.platformLabel}</Text>
            <span className="relaydesk-agentTag">{displayAgentName(session.agentValue)}</span>
            {session.isPrimary ? <span className="relaydesk-sessionListBadge">当前</span> : null}
          </div>
          <div className="relaydesk-sessionDetailMetaRow">
            <span>{session.updatedAtFullLabel}</span>
            <span>{session.continuityLabel}</span>
            <span>{session.turnCount} 条记录</span>
          </div>
        </div>
        <div className="relaydesk-sessionDetailActions">
          <Button
            size="2"
            variant="soft"
            color="gray"
            onClick={() => void studio.actions.revealPath(session.workDir)}
            disabled={!studio.snapshot.desktopSupported}
          >
            <ArrowUpRight size={14} />
            打开目录
          </Button>
          <Button size="2" variant="soft" color="gray" onClick={() => studio.actions.setCurrentView("console")}>
            返回控制台
          </Button>
        </div>
      </div>

      <div className="relaydesk-sessionDetailGrid">
        <div className="relaydesk-sessionDetailStat">
          <span className="relaydesk-sessionDetailLabel">会话 ID</span>
          <div className="relaydesk-sessionDetailValueRow">
            <span className="relaydesk-sessionDetailValue relaydesk-sessionDetailValue--mono">{session.sessionId}</span>
            <button type="button" className="relaydesk-sessionInlineAction" onClick={() => void copyText(session.sessionId)}>
              <Copy size={14} />
            </button>
          </div>
        </div>
        <div className="relaydesk-sessionDetailStat">
          <span className="relaydesk-sessionDetailLabel">会话时间</span>
          <span className="relaydesk-sessionDetailValue">{session.updatedAtFullLabel}</span>
        </div>
        <div className="relaydesk-sessionDetailStat">
          <span className="relaydesk-sessionDetailLabel">对话 ID</span>
          <span className="relaydesk-sessionDetailValue relaydesk-sessionDetailValue--mono">{session.activeConvId}</span>
        </div>
        <div className="relaydesk-sessionDetailStat">
          <span className="relaydesk-sessionDetailLabel">最近重置原因</span>
          <span className="relaydesk-sessionDetailValue">{session.lastResetReasonLabel}</span>
        </div>
        <div className="relaydesk-sessionDetailStat relaydesk-sessionDetailStat--wide">
          <span className="relaydesk-sessionDetailLabel">工作目录</span>
          <div className="relaydesk-sessionDetailValueRow">
            <span className="relaydesk-sessionDetailValue relaydesk-sessionDetailValue--mono">{session.workDir}</span>
            <button type="button" className="relaydesk-sessionInlineAction" onClick={() => void studio.actions.revealPath(session.workDir)}>
              <FolderOpen size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="relaydesk-sessionTurnsHeader">
        <div className="relaydesk-sessionTurnsTitle">
          <MessageSquareText size={15} />
          <span>对话记录</span>
          <span className="relaydesk-sessionPageCount">{session.turns.length}</span>
        </div>
        <div className="relaydesk-sessionTurnsScope">
          <History size={14} />
          <span>{session.chatId}</span>
        </div>
      </div>

      <div className="relaydesk-sessionTurnsList">
        {session.turns.length > 0 ? (
          session.turns.map((turn) => (
            <div key={turn.key} className="relaydesk-sessionTurn">
              <div className="relaydesk-sessionTurnTopline">
                <span className="relaydesk-sessionTurnRole" data-role={turn.role}>{turn.roleLabel}</span>
                <span className="relaydesk-sessionTurnTime">{turn.timeLabel}</span>
              </div>
              <Text size="2" className="relaydesk-sessionTurnContent">{turn.content}</Text>
            </div>
          ))
        ) : (
          <Flex align="center" justify="center" className="relaydesk-sessionTurnsEmpty">
            <Text size="2" color="gray">当前会话还没有可展示的对话记录</Text>
          </Flex>
        )}
      </div>
    </section>
  );
}

export function SessionManagementView({ studio }: SessionManagementViewProps) {
  const sessions = useMemo(() => buildSessionManagementEntries(studio), [studio]);
  const [selectedKey, setSelectedKey] = useState<string | null>(sessions[0]?.key ?? null);

  useEffect(() => {
    if (sessions.length === 0) {
      setSelectedKey(null);
      return;
    }

    if (!selectedKey || !sessions.some((session) => session.key === selectedKey)) {
      setSelectedKey(sessions[0].key);
    }
  }, [selectedKey, sessions]);

  const selectedSession = sessions.find((session) => session.key === selectedKey) ?? sessions[0];

  return (
    <Flex direction="column" className="relaydesk-pageSection relaydesk-pageSection--fill">
      <PageTopline
        title="会话管理"
        summary={`当前共 ${sessions.length} 条会话记录`}
        actions={(
          <Button size="2" variant="soft" color="gray" onClick={() => studio.actions.setCurrentView("console")}>
            <ArrowLeft size={14} />
            返回
          </Button>
        )}
      />
      <div className="relaydesk-sessionPageLayout">
        <SessionList selectedKey={selectedKey} sessions={sessions} onSelect={setSelectedKey} />
        <SessionDetail studio={studio} session={selectedSession} />
      </div>
    </Flex>
  );
}
