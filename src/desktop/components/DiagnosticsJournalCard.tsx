import { Badge, Button, Flex, Text } from "@radix-ui/themes";
import { RefreshCw, TerminalSquare, TriangleAlert } from "lucide-react";
import type { RelayDeskStudio } from "../types";
import { buildDiagnosticsJournalModel } from "./diagnostics-journal-model";

interface DiagnosticsJournalCardProps {
  readonly studio: RelayDeskStudio;
}

function levelColor(level: string) {
  if (level === "ERROR") return "red";
  if (level === "WARN") return "amber";
  if (level === "INFO") return "teal";
  return "gray";
}

function refreshLogs(studio: RelayDeskStudio) {
  return studio.actions.refreshJournal
    ? studio.actions.refreshJournal()
    : studio.actions.refresh();
}

export function DiagnosticsJournalCard({ studio }: DiagnosticsJournalCardProps) {
  const model = buildDiagnosticsJournalModel({
    journal: studio.snapshot.journal ?? studio.snapshot.bootstrap?.journal ?? null,
    journalBusy: studio.snapshot.journalBusy ?? false,
    journalError: studio.snapshot.journalError ?? null,
  });

  return (
    <section className="relaydesk-dashCard relaydesk-diagnosticsLogCard">
      <div className="relaydesk-diagnosticsLogHeader">
        <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
          <Flex align="center" gap="2">
            <TerminalSquare size={14} color="var(--text-muted)" />
            <Text size="2" weight="bold">{model.fileLabel}</Text>
            <Badge color="gray" variant="soft">事件流</Badge>
          </Flex>
          <Text size="1" color="gray">{model.metaLabel}</Text>
        </Flex>
        <Button
          size="1"
          variant="soft"
          color="gray"
          onClick={() => void refreshLogs(studio)}
          disabled={studio.snapshot.journalBusy ?? false}
        >
          <RefreshCw size={14} className={studio.snapshot.journalBusy ? "relaydesk-spin" : undefined} />
          刷新
        </Button>
      </div>

      {model.showError ? (
        <div className="relaydesk-diagnosticsLogAlert" data-tone="danger">
          <TriangleAlert size={14} />
          <Text size="2">{model.error}</Text>
        </div>
      ) : null}

      {model.showNotice ? (
        <div className="relaydesk-diagnosticsLogEmpty">
          <Text size="2" color="gray">{model.notice}</Text>
        </div>
      ) : (
        <div className="relaydesk-diagnosticsLogStream">
          {model.entries.map((entry) => (
            <article key={`${entry.occurredAt ?? "raw"}-${entry.raw}`} className="relaydesk-diagnosticsLogRow" data-tone={entry.tone}>
              <div className="relaydesk-diagnosticsLogDot" />
              <div className="relaydesk-diagnosticsLogTime">
                <Text size="1" color="gray">{entry.timeLabel}</Text>
              </div>
              <div className="relaydesk-diagnosticsLogBody">
                <Flex align="center" gap="2" wrap="wrap">
                  <Badge color={levelColor(entry.level)} variant="soft">{entry.level}</Badge>
                  {entry.tag ? <Text size="1" color="gray">{entry.tag}</Text> : null}
                </Flex>
                <Text size="2" weight="medium">{entry.title}</Text>
                {entry.detail ? (
                  <Text size="2" color="gray" className="relaydesk-diagnosticsLogDetail">{entry.detail}</Text>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
