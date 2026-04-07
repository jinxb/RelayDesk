import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const LOG_FILE_SUFFIX = ".log";
const MAX_JOURNAL_LINES = 120;
const LOG_LINE_PATTERN =
  /^(?<occurredAt>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[(?<level>[A-Z]+)\] \[(?<tag>[^\]]+)\] (?<message>.+)$/;

export interface JournalEntry {
  readonly raw: string;
  readonly occurredAt: string | null;
  readonly timeLabel: string;
  readonly level: string;
  readonly tag: string | null;
  readonly title: string;
  readonly detail: string;
  readonly tone: "neutral" | "success" | "warning" | "danger";
}

export interface JournalSnapshot {
  readonly latestFile: string | null;
  readonly excerpt: string[];
  readonly entries: readonly JournalEntry[];
  readonly updatedAt: string | null;
  readonly totalLines: number;
  readonly truncated: boolean;
  readonly notice: string | null;
}

interface ParsedLogLine {
  readonly raw: string;
  readonly occurredAt: string;
  readonly level: string;
  readonly tag: string;
  readonly message: string;
}

interface JournalPresentation {
  readonly title: string;
  readonly detail: string;
  readonly tone: JournalEntry["tone"];
}

function missingSnapshot(message: string): JournalSnapshot {
  return {
    latestFile: null,
    excerpt: [],
    entries: [],
    updatedAt: null,
    totalLines: 0,
    truncated: false,
    notice: message,
  };
}

function parseLogLine(raw: string): ParsedLogLine | null {
  const match = LOG_LINE_PATTERN.exec(raw.trim());
  if (!match?.groups) return null;
  return {
    raw,
    occurredAt: match.groups.occurredAt,
    level: match.groups.level,
    tag: match.groups.tag,
    message: match.groups.message,
  };
}

function timeLabel(occurredAt: string | null) {
  return occurredAt?.slice(11) ?? "--:--:--";
}

function toneFromLevel(level: string): JournalEntry["tone"] {
  if (level === "ERROR") return "danger";
  if (level === "WARN") return "warning";
  return "neutral";
}

function replaceKeyValue(message: string, key: string, replacement = "[已隐藏]") {
  return message.replace(new RegExp(`\\b${key}=[^,\\s]+`, "g"), `${key}=${replacement}`);
}

function redactQuotedSegment(message: string, key: string, replacement = "[已隐藏]") {
  return message.replace(new RegExp(`${key}="[^"]*"`, "g"), `${key}="${replacement}"`);
}

function redactMessage(message: string) {
  const hiddenKeys = [
    "chat",
    "convId",
    "cwd",
    "initialSessionId",
    "newConvId",
    "oldConvId",
    "old",
    "new",
    "path",
    "scope",
    "session",
    "sessionId",
    "user",
    "userId",
  ];
  const masked = hiddenKeys.reduce(
    (current, key) => replaceKeyValue(current, key),
    redactQuotedSegment(redactQuotedSegment(message, "args"), "prompt"),
  );
  return masked.replace(/\s+/g, " ").trim();
}

function summarizeWorkerEvent(tag: string, message: string): JournalPresentation | null {
  if (tag !== "RelayWorker") return null;
  if (message === "RelayDesk runtime booting") {
    return { title: "后台服务启动中", detail: "正在加载渠道与会话状态。", tone: "warning" };
  }
  if (message.startsWith("worker online:")) {
    return { title: "后台服务已就绪", detail: redactMessage(message), tone: "success" };
  }
  if (message === "RelayDesk runtime shutting down") {
    return { title: "后台服务正在停止", detail: "正在关闭渠道连接并清理会话。", tone: "warning" };
  }
  if (message.startsWith("active routes:") || message.startsWith("enabled channels:")) {
    return { title: "启动配置已确认", detail: redactMessage(message), tone: "neutral" };
  }
  if (message.startsWith("working tree:")) {
    return { title: "运行工作区已确认", detail: "当前路径已隐藏。", tone: "neutral" };
  }
  return null;
}

function summarizeChannelEvent(tag: string, message: string): JournalPresentation | null {
  if (tag === "QQ" && message.includes("READY")) {
    return { title: "QQ 已连接", detail: "网关握手完成。", tone: "success" };
  }
  if (tag === "QQ" && message.includes("gateway connected")) {
    return { title: "QQ 网关已连接", detail: "与 QQ 网关的连接已建立。", tone: "success" };
  }
  if (tag === "QQ" && message.includes("gateway reconnecting")) {
    return { title: "QQ 网关重连中", detail: "连接中断后正在自动恢复。", tone: "warning" };
  }
  if (tag === "QQ" && message.includes("gateway closed")) {
    return { title: "QQ 网关已断开", detail: redactMessage(message), tone: "warning" };
  }
  if (tag === "Telegram" && message === "Telegram bot launched") {
    return { title: "Telegram 已连接", detail: "机器人轮询已启动。", tone: "success" };
  }
  if (tag === "Feishu" && message === "Feishu WebSocket started") {
    return { title: "飞书已连接", detail: "事件流连接已建立。", tone: "success" };
  }
  if (tag === "WeChat" && message === "WeChat ilink runtime started") {
    return { title: "微信已连接", detail: "iLink 轮询运行中。", tone: "success" };
  }
  if (tag === "WeWork" && message.includes("authentication successful")) {
    return { title: "企业微信已连接", detail: "鉴权已通过。", tone: "success" };
  }
  return null;
}

function summarizeTaskEvent(tag: string, message: string): JournalPresentation | null {
  if (tag === "TgHandler" && message.startsWith("Running ")) {
    return { title: "收到 Telegram 请求", detail: "请求已进入当前会话。", tone: "neutral" };
  }
  if (tag === "QQHandler" && message.startsWith("QQ message handled:")) {
    return { title: "收到 QQ 消息", detail: redactMessage(message), tone: "neutral" };
  }
  if (tag === "Queue" && message.startsWith("Queued task for")) {
    return { title: "当前会话进入排队", detail: "请求已进入任务队列。", tone: "warning" };
  }
  if (tag === "AITask" && message.includes("[AITask] Starting:")) {
    return { title: "AI 任务开始", detail: redactMessage(message), tone: "neutral" };
  }
  if (tag === "AITask" && message.includes("SessionId callback:")) {
    return { title: "AI 会话已建立", detail: redactMessage(message), tone: "success" };
  }
  if (tag === "AITask" && message.includes("Session invalid")) {
    return { title: "AI 会话已失效", detail: redactMessage(message), tone: "warning" };
  }
  if (tag === "CodexCli" && message.startsWith("Spawning Codex CLI:")) {
    return { title: "Codex 已启动", detail: "执行参数已记录，敏感内容已隐藏。", tone: "neutral" };
  }
  if (tag === "CodexCli" && message.startsWith("Codex CLI closed:")) {
    const tone = message.includes("exitCode=0") ? "success" : "danger";
    const title = tone === "success" ? "Codex 执行完成" : "Codex 执行失败";
    return { title, detail: redactMessage(message), tone };
  }
  if (tag === "Session" && message.startsWith("New session for scope")) {
    return { title: "会话已切换", detail: "已创建新的任务会话。", tone: "neutral" };
  }
  return null;
}

function summarizeEntry(parsed: ParsedLogLine): JournalPresentation {
  const known =
    summarizeWorkerEvent(parsed.tag, parsed.message)
    ?? summarizeChannelEvent(parsed.tag, parsed.message)
    ?? summarizeTaskEvent(parsed.tag, parsed.message);
  if (known) return known;
  if (parsed.level === "ERROR") {
    return { title: `${parsed.tag} 异常`, detail: redactMessage(parsed.message), tone: "danger" };
  }
  if (parsed.level === "WARN") {
    return { title: `${parsed.tag} 警告`, detail: redactMessage(parsed.message), tone: "warning" };
  }
  return {
    title: parsed.tag,
    detail: redactMessage(parsed.message),
    tone: toneFromLevel(parsed.level),
  };
}

function buildEntry(raw: string): JournalEntry {
  const parsed = parseLogLine(raw);
  if (!parsed) {
    return {
      raw,
      occurredAt: null,
      timeLabel: "--:--:--",
      level: "RAW",
      tag: null,
      title: "原始日志",
      detail: redactMessage(raw),
      tone: "neutral",
    };
  }
  const presentation = summarizeEntry(parsed);
  return {
    raw,
    occurredAt: parsed.occurredAt,
    timeLabel: timeLabel(parsed.occurredAt),
    level: parsed.level,
    tag: parsed.tag,
    title: presentation.title,
    detail: presentation.detail,
    tone: presentation.tone,
  };
}

function latestLogFile(logDir: string) {
  return readdirSync(logDir)
    .filter((name) => name.endsWith(LOG_FILE_SUFFIX))
    .map((name) => ({
      name,
      stamp: statSync(join(logDir, name)).mtimeMs,
    }))
    .sort((left, right) => right.stamp - left.stamp)[0];
}

export function readJournalExcerpt(logDir: string): JournalSnapshot {
  if (!existsSync(logDir)) {
    return missingSnapshot("等待首次启动后生成运行日志。");
  }
  const latest = latestLogFile(logDir);
  if (!latest) {
    return missingSnapshot("等待首次启动后生成运行日志。");
  }
  const filePath = join(logDir, latest.name);
  const allLines = readFileSync(filePath, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean);
  const excerpt = allLines.slice(-MAX_JOURNAL_LINES);
  return {
    latestFile: basename(filePath),
    excerpt,
    entries: excerpt.map(buildEntry),
    updatedAt: new Date(latest.stamp).toISOString(),
    totalLines: allLines.length,
    truncated: allLines.length > excerpt.length,
    notice: excerpt.length === 0 ? "日志文件存在，但尚未产生事件。" : null,
  };
}
