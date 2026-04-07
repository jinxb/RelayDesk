import { describe, expect, it } from "vitest";
import { buildDiagnosticsJournalModel } from "./components/diagnostics-journal-model";

describe("buildDiagnosticsJournalModel", () => {
  it("returns a waiting state before the first journal sync", () => {
    const model = buildDiagnosticsJournalModel({
      journal: null,
      journalBusy: false,
      journalError: null,
    });

    expect(model.fileLabel).toBe("暂无运行日志");
    expect(model.showNotice).toBe(true);
    expect(model.notice).toBe("等待首次同步日志。");
  });

  it("builds meta text from structured journal data", () => {
    const model = buildDiagnosticsJournalModel({
      journal: {
        latestFile: "2026-03-31.log",
        excerpt: ["raw"],
        entries: [
          {
            raw: "raw",
            occurredAt: "2026-03-31 20:06:17",
            timeLabel: "20:06:17",
            level: "INFO",
            tag: "RelayWorker",
            title: "后台服务已就绪",
            detail: "worker online: qq, telegram",
            tone: "success",
          },
        ],
        updatedAt: "2026-03-31T12:06:17.000Z",
        totalLines: 245,
        truncated: true,
        notice: null,
      },
      journalBusy: true,
      journalError: null,
    });

    expect(model.fileLabel).toBe("2026-03-31.log");
    expect(model.entries).toHaveLength(1);
    expect(model.metaLabel).toContain("显示最近 1 条 / 共 245 条");
    expect(model.refreshing).toBe(true);
    expect(model.showNotice).toBe(false);
  });

  it("preserves refresh errors while still surfacing the latest journal data", () => {
    const model = buildDiagnosticsJournalModel({
      journal: {
        latestFile: "2026-03-31.log",
        excerpt: [],
        entries: [],
        updatedAt: null,
        totalLines: 0,
        truncated: false,
        notice: "日志文件存在，但尚未产生事件。",
      },
      journalBusy: false,
      journalError: "sidecar unavailable",
    });

    expect(model.showError).toBe(true);
    expect(model.error).toBe("sidecar unavailable");
    expect(model.showNotice).toBe(true);
    expect(model.notice).toBe("日志文件存在，但尚未产生事件。");
  });

  it("falls back to raw excerpt lines when structured entries are missing", () => {
    const model = buildDiagnosticsJournalModel({
      journal: {
        latestFile: "2026-03-31.log",
        excerpt: [
          "2026-03-31 20:06:17 [INFO] [RelayWorker] worker online: qq",
        ],
        updatedAt: null,
        totalLines: 1,
        truncated: false,
        notice: null,
      },
      journalBusy: false,
      journalError: null,
    });

    expect(model.entries).toHaveLength(1);
    expect(model.entries[0]).toMatchObject({
      level: "INFO",
      tag: "RelayWorker",
      title: "RelayWorker",
      detail: "worker online: qq",
    });
    expect(model.showNotice).toBe(false);
    expect(model.metaLabel).toContain("共 1 条");
  });
});
