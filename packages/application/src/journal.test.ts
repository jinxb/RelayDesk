import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { readJournalExcerpt } from "./journal.js";

const TEMP_DIRS: string[] = [];

function createTempDir() {
  const dir = mkdtempSync(join(tmpdir(), "relaydesk-journal-"));
  TEMP_DIRS.push(dir);
  return dir;
}

function writeLog(dir: string, name: string, lines: readonly string[]) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), `${lines.join("\n")}\n`, "utf-8");
}

afterEach(() => {
  while (TEMP_DIRS.length > 0) {
    rmSync(TEMP_DIRS.pop()!, { recursive: true, force: true });
  }
});

describe("readJournalExcerpt", () => {
  it("returns an empty production-safe snapshot when no log directory exists", () => {
    const snapshot = readJournalExcerpt("/tmp/relaydesk-missing-log-dir");

    expect(snapshot.latestFile).toBeNull();
    expect(snapshot.entries).toEqual([]);
    expect(snapshot.notice).toBe("等待首次启动后生成运行日志。");
  });

  it("builds structured entries and redacts sensitive runtime context", () => {
    const dir = createTempDir();
    writeLog(dir, "2026-03-31.log", [
      "2026-03-31 20:06:17 [INFO] [AITask] [AITask] Starting: userId=scope:telegram:7487096383, initialSessionId=019d, continuity=native, prompt=\"请查阅诊断页面中的日志模块...\"",
      "2026-03-31 20:06:17 [INFO] [CodexCli] Spawning Codex CLI: path=codex, cwd=/Users/example/workspace/project, session=019d, args=exec resume --json --dangerously-bypass-approvals-and-sandbox",
      "2026-03-31 20:06:30 [ERROR] [QQ] QQ gateway error: timeout while connecting",
    ]);

    const snapshot = readJournalExcerpt(dir);

    expect(snapshot.latestFile).toBe("2026-03-31.log");
    expect(snapshot.totalLines).toBe(3);
    expect(snapshot.notice).toBeNull();
    expect(snapshot.entries).toHaveLength(3);
    expect(snapshot.entries[0]).toMatchObject({
      timeLabel: "20:06:17",
      level: "INFO",
      tag: "AITask",
      title: "AI 任务开始",
    });
    expect(snapshot.entries[0]?.detail).toContain("userId=[已隐藏]");
    expect(snapshot.entries[0]?.detail).toContain("prompt=\"[已隐藏]\"");
    expect(snapshot.entries[1]).toMatchObject({
      tag: "CodexCli",
      title: "Codex 已启动",
      detail: "执行参数已记录，敏感内容已隐藏。",
    });
    expect(snapshot.entries[2]).toMatchObject({
      level: "ERROR",
      tag: "QQ",
      title: "QQ 异常",
      tone: "danger",
    });
  });

  it("keeps only the latest 120 non-empty lines and marks the snapshot as truncated", () => {
    const dir = createTempDir();
    const lines = Array.from({ length: 125 }, (_, index) =>
      `2026-03-31 20:06:${String(index % 60).padStart(2, "0")} [INFO] [RelayWorker] active routes: codex-${index}`,
    );
    writeLog(dir, "2026-03-31.log", lines);

    const snapshot = readJournalExcerpt(dir);

    expect(snapshot.totalLines).toBe(125);
    expect(snapshot.excerpt).toHaveLength(120);
    expect(snapshot.entries).toHaveLength(120);
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.excerpt[0]).toContain("codex-5");
  });

  it("maps Telegram handler task dispatch logs into a user-facing title", () => {
    const dir = createTempDir();
    writeLog(dir, "2026-03-31.log", [
      "2026-03-31 21:43:21 [INFO] [TgHandler] Running codex for scope scope:telegram:1:1:-, sessionId=abc",
    ]);

    const snapshot = readJournalExcerpt(dir);

    expect(snapshot.entries[0]).toMatchObject({
      tag: "TgHandler",
      title: "收到 Telegram 请求",
      detail: "请求已进入当前会话。",
      tone: "neutral",
    });
  });
});
