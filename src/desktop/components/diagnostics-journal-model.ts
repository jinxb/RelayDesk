import type { BootstrapPayload, JournalEntryModel } from "../../lib/models";

interface DiagnosticsJournalModelOptions {
  readonly journal: BootstrapPayload["journal"] | null;
  readonly journalBusy: boolean;
  readonly journalError: string | null;
}

export interface DiagnosticsJournalModel {
  readonly entries: readonly JournalEntryModel[];
  readonly error: string | null;
  readonly fileLabel: string;
  readonly metaLabel: string;
  readonly notice: string;
  readonly refreshing: boolean;
  readonly showError: boolean;
  readonly showNotice: boolean;
}

const LOG_LINE_PATTERN =
  /^(?<occurredAt>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[(?<level>[A-Z]+)\] \[(?<tag>[^\]]+)\] (?<message>.+)$/;

function formatUpdatedAt(value: string | null | undefined) {
  if (!value) return "尚未同步";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "尚未同步";
  return date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeJournalEntries(journal: BootstrapPayload["journal"] | null) {
  const structured = journal?.entries ?? [];
  if (structured.length > 0) return structured;

  return (journal?.excerpt ?? []).map((raw) => {
    const match = LOG_LINE_PATTERN.exec(raw.trim());
    if (!match?.groups) {
      return {
        raw,
        occurredAt: null,
        timeLabel: "--:--:--",
        level: "RAW",
        tag: null,
        title: "原始日志",
        detail: raw,
        tone: "neutral",
      } satisfies JournalEntryModel;
    }

    const occurredAt = match.groups.occurredAt;
    return {
      raw,
      occurredAt,
      timeLabel: occurredAt.slice(11),
      level: match.groups.level,
      tag: match.groups.tag,
      title: match.groups.tag,
      detail: match.groups.message,
      tone: match.groups.level === "ERROR"
        ? "danger"
        : match.groups.level === "WARN"
          ? "warning"
          : "neutral",
    } satisfies JournalEntryModel;
  });
}

function buildMetaLabel(journal: BootstrapPayload["journal"] | null) {
  if (!journal) return "等待首次同步日志。";
  const count = normalizeJournalEntries(journal).length;
  const total = journal.totalLines ?? count;
  const updatedAt = formatUpdatedAt(journal.updatedAt);
  const truncated = journal.truncated ? `，显示最近 ${count} 条 / 共 ${total} 条` : `，共 ${total} 条`;
  return `最近同步 ${updatedAt}${count > 0 ? truncated : ""}`;
}

function resolveNotice(journal: BootstrapPayload["journal"] | null) {
  if (!journal) return "等待首次同步日志。";
  return journal.notice ?? (normalizeJournalEntries(journal).length ? "" : "日志文件存在，但尚未产生事件。");
}

export function buildDiagnosticsJournalModel(
  options: DiagnosticsJournalModelOptions,
): DiagnosticsJournalModel {
  const entries = normalizeJournalEntries(options.journal);
  const notice = resolveNotice(options.journal);
  return {
    entries,
    error: options.journalError,
    fileLabel: options.journal?.latestFile ?? "暂无运行日志",
    metaLabel: buildMetaLabel(options.journal),
    notice,
    refreshing: options.journalBusy,
    showError: Boolean(options.journalError),
    showNotice: entries.length === 0,
  };
}
