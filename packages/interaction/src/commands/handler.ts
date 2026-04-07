import {
  resolvePlatformAiCommand,
  SessionManager,
  TERMINAL_ONLY_COMMANDS,
  type Config,
} from "../../../state/src/index.js";
import type { RequestQueue } from "../queue/request-queue.js";
import { escapePathForMarkdown } from '../shared/utils.js';
import { execFile } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { ThreadContext } from "../shared/types.js";

export type { ThreadContext };

export interface MessageSender {
  sendTextReply(chatId: string, text: string, threadCtx?: ThreadContext): Promise<void>;
  sendDirectorySelection?(chatId: string, currentDir: string, userId: string): Promise<void>;
}

export interface CommandHandlerDeps {
  config: Config;
  sessionManager: SessionManager;
  requestQueue: RequestQueue;
  sender: MessageSender;
  getRunningTasksSize: () => number;
}

export type ClaudeRequestHandler = (
  userId: string,
  chatId: string,
  prompt: string,
  workDir: string,
  convId?: string,
  threadCtx?: ThreadContext,
  replyToMessageId?: string
) => Promise<void>;

export class CommandHandler {
  constructor(private deps: CommandHandlerDeps) {}

  private formatResetReason(reason: string | undefined): string | undefined {
    if (reason === "user_new") return "用户手动新建";
    if (reason === "workdir_changed") return "工作目录切换";
    if (reason === "startup") return "服务重启";
    if (reason === "session_invalid") return "原生会话失效";
    if (reason === "task_error") return "任务错误";
    return undefined;
  }

  private formatContinuityMode(mode: string): string {
    if (mode === "native") return "原生续接";
    if (mode === "relay") return "RelayDesk 续接";
    return "全新上下文";
  }

  async dispatch(
    text: string,
    chatId: string,
    userId: string,
    platform: 'dingtalk' | 'feishu' | 'qq' | 'telegram' | 'wechat' | 'wework',
    handleClaudeRequest: ClaudeRequestHandler
  ): Promise<boolean> {
    const t = text.trim();

    if (platform === 'telegram' && t === '/start') {
      await this.deps.sender.sendTextReply(chatId, '欢迎使用 RelayDesk。\n\n发送消息即可与本地编码代理协作，输入 /help 查看帮助。');
      return true;
    }

    if (t === '/help') return this.handleHelp(chatId, platform);
    if (t === '/new') return this.handleNew(chatId, userId, platform);
    if (t === '/pwd') return this.handlePwd(chatId, userId);
    if (t === '/status') return this.handleStatus(chatId, userId, platform);

    if (t === '/cd' || t.startsWith('/cd ')) {
      return this.handleCd(chatId, userId, t.slice(3).trim(), platform);
    }

    const cmd = t.split(/\s+/)[0];
    if (TERMINAL_ONLY_COMMANDS.has(cmd)) {
      await this.deps.sender.sendTextReply(chatId, `${cmd} 命令仅在终端可用。`);
      return true;
    }

    return false;
  }

  private getClearHistoryHint(platform: 'dingtalk' | 'feishu' | 'qq' | 'telegram' | 'wechat' | 'wework'): string {
    if (platform === 'feishu') {
      return '💡 提示：如需清除本对话的历史消息，请点击飞书聊天右上角「...」→ 清除聊天记录';
    }
    if (platform === 'wechat') {
      return '💡 提示：如需清除本对话的历史消息，请在微信中清空聊天记录';
    }
    if (platform === 'dingtalk') {
      return '💡 提示：如需清除本对话的历史消息，请在钉钉中清空聊天记录';
    }
    if (platform === 'qq') {
      return '💡 提示：如需清除本对话的历史消息，请在 QQ 中清空聊天记录';
    }
    if (platform === 'wework') {
      return '💡 提示：如需清除本对话的历史消息，请在企业微信中清空聊天记录';
    }
    return '💡 提示：如需清除本对话的历史消息，请点击 Telegram 聊天右上角 ⋮ → 清除历史';
  }

  private supportsDirectoryPicker(platform: 'dingtalk' | 'feishu' | 'qq' | 'telegram' | 'wechat' | 'wework'): boolean {
    return platform === 'telegram' || platform === 'qq' || platform === 'wework' || platform === 'dingtalk';
  }

  private buildQueueResetNote(stats: { running: boolean; dropped: number }): string[] {
    const lines: string[] = [];
    if (stats.dropped > 0) {
      lines.push(`🧹 已清除 ${stats.dropped} 条排队请求。`);
    }
    if (stats.running) {
      lines.push('⏳ 当前正在执行的任务不会被强制中断，其结果仍可能继续返回。');
    }
    return lines;
  }

  private async handleHelp(chatId: string, platform: 'dingtalk' | 'feishu' | 'qq' | 'telegram' | 'wechat' | 'wework'): Promise<boolean> {
    const help = [
      '📋 可用命令:',
      '',
      ...(platform === 'telegram' ? ['/start - 显示欢迎信息'] : []),
      '/help - 显示帮助',
      '/new - 开始新会话（AI 上下文重置）',
      '/status - 显示状态',
      '/cd <路径> - 切换工作目录',
      '/pwd - 当前工作目录',
      ...(this.supportsDirectoryPicker(platform) ? ['直接发送 /cd 可打开目录选择器'] : []),
      '',
      this.getClearHistoryHint(platform),
    ].join('\n');
    await this.deps.sender.sendTextReply(chatId, help);
    return true;
  }

  private async handleNew(chatId: string, userId: string, platform: 'dingtalk' | 'feishu' | 'qq' | 'telegram' | 'wechat' | 'wework'): Promise<boolean> {
    const aiCommand = resolvePlatformAiCommand(this.deps.config, platform);
    const previousConvId = this.deps.sessionManager.getConversationStatus(userId, aiCommand).convId;
    const ok = this.deps.sessionManager.newSession(userId);
    const queueStats = this.deps.requestQueue.clearPending(userId, previousConvId);
    const queueNotes = this.buildQueueResetNote(queueStats);
    await this.deps.sender.sendTextReply(
      chatId,
      ok
        ? [
            '✅ AI 会话已重置，后续新消息将使用全新上下文。',
            ...queueNotes,
            '',
            this.getClearHistoryHint(platform),
          ].join('\n')
        : '当前没有活动会话。'
    );
    return true;
  }

  private async handlePwd(chatId: string, userId: string): Promise<boolean> {
    const workDir = this.deps.sessionManager.getWorkDir(userId);
    await this.deps.sender.sendTextReply(chatId, `当前工作目录: ${escapePathForMarkdown(workDir)}`);
    return true;
  }

  private async handleStatus(chatId: string, userId: string, platform: 'dingtalk' | 'feishu' | 'qq' | 'telegram' | 'wechat' | 'wework'): Promise<boolean> {
    const aiCommand = resolvePlatformAiCommand(this.deps.config, platform);
    const version = await this.getAiVersion(aiCommand);
    const status = this.deps.sessionManager.getConversationStatus(userId, aiCommand);
    const resetReason = this.formatResetReason(status.lastResetReason);
    const queue = this.deps.requestQueue.inspect(userId, status.convId);
    const lines = [
      '📊 状态:',
      '',
      `AI 工具: ${aiCommand}`,
      `版本/模式: ${version}`,
      `工作目录: ${escapePathForMarkdown(status.workDir)}`,
      `会话: ${status.sessionId ?? '无'}`,
      `上下文模式: ${this.formatContinuityMode(status.continuityMode)}`,
      `当前对话 ID: ${status.convId ?? '无'}`,
      `已保存上下文片段: ${status.historyTurns}`,
      ...(resetReason ? [`最近重置原因: ${resetReason}`] : []),
      `当前对话排队: ${queue.pending}`,
      `运行中任务: ${this.deps.getRunningTasksSize()}`,
    ];
    await this.deps.sender.sendTextReply(chatId, lines.join('\n'));
    return true;
  }

  private async handleCd(chatId: string, userId: string, dir: string, platform: 'dingtalk' | 'feishu' | 'qq' | 'telegram' | 'wechat' | 'wework'): Promise<boolean> {
    // 如果 dir 为空，显示目录选择界面
    if (!dir) {
      const currentDir = this.deps.sessionManager.getWorkDir(userId);
      if (this.deps.sender.sendDirectorySelection) {
        await this.deps.sender.sendDirectorySelection(chatId, currentDir, userId);
      } else {
        await this.deps.sender.sendTextReply(
          chatId,
          `当前目录: ${escapePathForMarkdown(currentDir)}\n使用 /cd <路径> 切换`
        );
      }
      return true;
    }
    try {
      const aiCommand = resolvePlatformAiCommand(this.deps.config, platform);
      const previousConvId = this.deps.sessionManager.getConversationStatus(userId, aiCommand).convId;
      const resolved = await this.deps.sessionManager.setWorkDir(userId, dir);
      const queueStats = this.deps.requestQueue.clearPending(userId, previousConvId);
      await this.deps.sender.sendTextReply(
        chatId,
        [
          `📁 工作目录已切换到: ${escapePathForMarkdown(resolved)}`,
          '',
          '🔄 AI 会话已重置，后续新消息将使用新目录和全新上下文。',
          ...this.buildQueueResetNote(queueStats),
          this.getClearHistoryHint(platform),
        ].join('\n')
      );
    } catch (err) {
      await this.deps.sender.sendTextReply(chatId, err instanceof Error ? err.message : String(err));
    }
    return true;
  }

  private getAiVersion(aiCommand: 'claude' | 'codex' | 'codebuddy'): Promise<string> {
    if (aiCommand === 'claude') {
      return Promise.resolve('SDK 模式');
    }
    const cmd = aiCommand === 'codex'
      ? this.deps.config.codexCliPath
      : this.deps.config.codebuddyCliPath;
    return new Promise((resolve) => {
      execFile(cmd, ['--version'], { timeout: 5000 }, (err, stdout) => {
        resolve(err ? '未知' : (stdout?.toString().trim() || '未知'));
      });
    });
  }
}

/**
 * 列出目录并返回目录信息
 */
export function listDirectories(basePath: string): { name: string; fullPath: string; isParent: boolean }[] {
  const dirs: { name: string; fullPath: string; isParent: boolean }[] = [];

  try {
    // 添加返回上级目录选项（如果不是根目录）
    const parent = dirname(basePath);
    if (parent !== basePath) {
      dirs.push({ name: '🔙 返回上级', fullPath: parent, isParent: true });
    }

    // 读取子目录
    const entries = readdirSync(basePath, { withFileTypes: true });
    const subDirs = entries
      .filter((entry) => entry.isDirectory())
      .filter((entry) => !entry.name.startsWith('.')) // 过滤隐藏目录
      .map((entry) => ({
        name: entry.name,
        fullPath: join(basePath, entry.name),
        isParent: false,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)); // 按名称排序

    dirs.push(...subDirs);
  } catch {
    // 忽略错误
  }

  return dirs;
}

/**
 * 生成目录选择的按钮布局
 */
export function buildDirectoryKeyboard(
  directories: { name: string; fullPath: string; isParent: boolean }[],
  userId: string
): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
  const buttons: Array<Array<{ text: string; callback_data: string }>> = [];

  // 每行 2 个按钮
  for (let i = 0; i < directories.length; i += 2) {
    const row: Array<{ text: string; callback_data: string }> = [];
    row.push({
      text: directories[i].name,
      callback_data: `cd:${userId}:${encodeURIComponent(directories[i].fullPath)}`,
    });

    if (i + 1 < directories.length) {
      row.push({
        text: directories[i + 1].name,
        callback_data: `cd:${userId}:${encodeURIComponent(directories[i + 1].fullPath)}`,
      });
    }

    buttons.push(row);
  }

  return { inline_keyboard: buttons };
}
