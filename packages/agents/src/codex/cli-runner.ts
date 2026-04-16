/**
 * Codex CLI runner for `codex exec --json` JSONL output.
 */

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { createLogger } from '../../../state/src/index.js';
import {
  clampIdleTimeoutMs,
  DEFAULT_IDLE_TIMEOUT_MS,
  parseTimeoutMs,
  sanitizeTimeoutMs,
} from '../../../state/src/timeout-defaults.js';

const log = createLogger('CodexCli');
const windowsCodexLaunchCache = new Map<string, { command: string; args: string[] } | null>();
const posixCodexLaunchCache = new Map<string, { command: string; args: string[] } | null>();
const stdinDashSupportCache = new Map<string, boolean>();
const codexCliInspectionCache = new Map<string, CodexCliInspection>();
const INLINE_PROMPT_CHAR_LIMIT = 24_000;
const WINDOWS_SHELL_INLINE_PROMPT_CHAR_LIMIT = 7_000;
const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.tif',
  '.tiff',
  '.avif',
]);

function resolveRunTimeoutMs(timeoutMs: number | undefined): number {
  return sanitizeTimeoutMs(timeoutMs) ?? 0;
}

export function resolveCodexIdleTimeoutMs(
  idleTimeoutMs: number | undefined,
  totalTimeoutMs: number,
): number {
  const configuredIdleTimeoutMs =
    sanitizeTimeoutMs(idleTimeoutMs)
    ?? parseTimeoutMs(process.env.CODEX_IDLE_TIMEOUT_MS)
    ?? DEFAULT_IDLE_TIMEOUT_MS;

  return clampIdleTimeoutMs(configuredIdleTimeoutMs, totalTimeoutMs);
}

export interface CodexRunCallbacks {
  onText: (accumulated: string) => void;
  onThinking?: (accumulated: string) => void;
  onToolUse?: (toolName: string, toolInput?: Record<string, unknown>) => void;
  onGeneratedImage?: (imagePath: string) => void;
  onGeneratedFile?: (filePath: string) => void;
  onComplete: (result: {
    success: boolean;
    result: string;
    accumulated: string;
    cost: number;
    durationMs: number;
    model?: string;
    numTurns: number;
    toolStats: Record<string, number>;
  }) => void;
  onError: (error: string) => void;
  onSessionId?: (sessionId: string) => void;
  onSessionInvalid?: () => void;
}

export interface CodexRunOptions {
  skipPermissions?: boolean;
  permissionMode?: 'default' | 'acceptEdits' | 'plan';
  timeoutMs?: number;
  idleTimeoutMs?: number;
  model?: string;
  chatId?: string;
  hookPort?: number;
  hookToken?: string;
  proxy?: string;
}

export interface CodexRunHandle {
  abort: () => void;
}

export type CodexPromptTransport = 'argv' | 'stdin-dash';

export interface CodexLaunchSpec {
  readonly args: string[];
  readonly promptTransport: CodexPromptTransport;
  readonly stdinPayload?: string;
}

export interface CodexCliInspection {
  readonly commandReady: boolean;
  readonly relaydeskCompatible: boolean;
  readonly supportsStdinDashPrompt: boolean | null;
  readonly supportsSkipGitRepoCheck: boolean | null;
  readonly supportsCd: boolean | null;
  readonly supportsFullAuto: boolean | null;
  readonly supportsDangerousBypass: boolean | null;
  readonly supportsSandbox: boolean | null;
  readonly supportsModel: boolean | null;
  readonly supportsImage: boolean | null;
  readonly supportsExecJson: boolean | null;
  readonly inlinePromptCharLimit: number;
  readonly issue: string | null;
}

export function resetCodexCliCachesForTests(): void {
  windowsCodexLaunchCache.clear();
  posixCodexLaunchCache.clear();
  stdinDashSupportCache.clear();
  codexCliInspectionCache.clear();
}

function parseCodexEvent(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isSupportedImagePath(filePath: string): boolean {
  const normalized = filePath.trim();
  if (!normalized || !existsSync(normalized)) return false;
  const lower = normalized.toLowerCase();
  return Array.from(SUPPORTED_IMAGE_EXTENSIONS).some((ext) => lower.endsWith(ext));
}

export function extractPromptImagePaths(prompt: string): string[] {
  const imagePaths = new Set<string>();
  const lines = prompt.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const singleMatch = /^Saved local file path:\s*(.+)$/i.exec(line);
    if (singleMatch) {
      const candidate = singleMatch[1].trim();
      if (isSupportedImagePath(candidate)) imagePaths.add(candidate);
      continue;
    }

    const batchMatch = /^\d+\.\s+(?:.+:\s+)?(.+?)\s+\((image)\)$/i.exec(line);
    if (batchMatch) {
      const candidate = batchMatch[1].trim();
      if (isSupportedImagePath(candidate)) imagePaths.add(candidate);
    }
  }

  return Array.from(imagePaths);
}

type CodexFileChange = { path?: string; kind?: string };

function resolveGeneratedImagePath(
  rawPath: unknown,
  workDir: string,
): string | null {
  const candidate = typeof rawPath === 'string' ? rawPath.trim() : '';
  if (!candidate) return null;
  const absolutePath = isAbsolute(candidate) ? candidate : resolve(workDir, candidate);
  return isSupportedImagePath(absolutePath) ? absolutePath : null;
}

export function extractGeneratedImagePaths(
  changes: CodexFileChange[] | undefined,
  workDir: string,
): string[] {
  const imagePaths = new Set<string>();
  for (const change of changes ?? []) {
    const imagePath = resolveGeneratedImagePath(change?.path, workDir);
    if (imagePath) {
      imagePaths.add(imagePath);
    }
  }
  return Array.from(imagePaths);
}

export function extractGeneratedFilePaths(
  changes: CodexFileChange[] | undefined,
  workDir: string,
): string[] {
  const filePaths = new Set<string>();
  for (const change of changes ?? []) {
    const candidate = typeof change?.path === 'string' ? change.path.trim() : '';
    if (!candidate) continue;
    const absolutePath = isAbsolute(candidate) ? candidate : resolve(workDir, candidate);
    if (!existsSync(absolutePath) || isSupportedImagePath(absolutePath)) continue;
    filePaths.add(absolutePath);
  }
  return Array.from(filePaths);
}

export function buildCodexArgs(
  prompt: string,
  sessionId: string | undefined,
  workDir: string,
  options?: CodexRunOptions,
  promptArg: string = prompt,
  inspection?: CodexCliInspection,
): string[] {
  if (inspection?.supportsExecJson === false) {
    throw new Error('当前 Codex CLI 不支持 `codex exec --json`，RelayDesk 无法解析结构化事件流。');
  }
  if (inspection?.supportsCd === false) {
    throw new Error('当前 Codex CLI 不支持全局 `--cd` 参数，RelayDesk 无法稳定设置工作目录。');
  }

  const execOptions = ['--json'];
  if (inspection?.supportsSkipGitRepoCheck === false) {
    log.warn('Codex CLI does not support --skip-git-repo-check; RelayDesk will run without this compatibility flag');
  } else {
    execOptions.push('--skip-git-repo-check');
  }

  const globalOptions = ['--cd', workDir];
  const canResume = Boolean(sessionId) && options?.permissionMode !== 'plan';
  const imagePaths = extractPromptImagePaths(prompt);

  if (options?.skipPermissions) {
    if (inspection?.supportsDangerousBypass === false) {
      throw new Error('当前 Codex CLI 不支持 `--dangerously-bypass-approvals-and-sandbox`，无法按 RelayDesk 的免确认模式运行。');
    }
    globalOptions.push('--dangerously-bypass-approvals-and-sandbox');
  } else if (options?.permissionMode === 'plan') {
    if (inspection?.supportsSandbox === false) {
      throw new Error('当前 Codex CLI 不支持 `--sandbox read-only`，无法启动 RelayDesk 的 plan 模式。');
    }
    globalOptions.push('--sandbox', 'read-only');
  } else {
    if (inspection?.supportsFullAuto === false) {
      throw new Error('当前 Codex CLI 不支持 `--full-auto`，无法按 RelayDesk 的默认自动执行模式运行。');
    }
    globalOptions.push('--full-auto');
  }

  if (options?.model) {
    if (inspection?.supportsModel === false) {
      throw new Error('当前 Codex CLI 不支持 `--model` 参数，但 RelayDesk 收到了模型覆盖请求。');
    }
    globalOptions.push('--model', options.model);
  }

  for (const imagePath of imagePaths) {
    if (inspection?.supportsImage === false) {
      throw new Error('当前 Codex CLI 不支持 `--image` 参数，无法处理带图片附件的 Codex 请求。');
    }
    globalOptions.push('--image', imagePath);
  }

  if (sessionId && !canResume) {
    log.warn('Codex plan mode does not support resume; starting a new read-only session');
  }

  const promptParts = promptArg.trim() ? [promptArg] : [];
  return canResume
    ? [...globalOptions, 'exec', 'resume', ...execOptions, sessionId!, ...promptParts]
    : [...globalOptions, 'exec', ...execOptions, ...promptParts];
}

function quoteForWindowsCmd(arg: string): string {
  if (/^[A-Za-z0-9_./:=+\\-]+$/.test(arg)) {
    return arg;
  }
  const escaped = arg
    .replace(/(\\*)"/g, '$1$1\\"')
    .replace(/(\\+)$/g, '$1$1')
    .replace(/%/g, '%%');
  return `"${escaped}"`;
}

function formatWindowsCommandName(command: string): string {
  if (/^[A-Za-z0-9_.-]+$/.test(command)) {
    return command;
  }
  return quoteForWindowsCmd(command);
}

function extractCodexJsFromCmdShim(cmdPath: string): string | null {
  try {
    const content = readFileSync(cmdPath, 'utf-8');
    const match = content.match(/"%~dp0\\([^"\r\n]*codex\\bin\\codex\.js)"/i);
    if (!match) return null;
    const relativeJsPath = match[1].replace(/\\/g, '/');
    return join(dirname(cmdPath), relativeJsPath);
  } catch {
    return null;
  }
}

function resolveWindowsCmdShimPath(cliPath: string): string | null {
  if (/\.(cmd|bat)$/i.test(cliPath) && existsSync(cliPath)) {
    return cliPath;
  }

  try {
    const whereOutput = execFileSync('where', [cliPath], {
      stdio: 'pipe',
      windowsHide: true,
    })
      .toString()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    return whereOutput.find((line) => /\.cmd$/i.test(line)) ?? null;
  } catch {
    return null;
  }
}

function extractCodexJsFromPosixShim(shimPath: string): string | null {
  try {
    const content = readFileSync(shimPath, 'utf-8');
    const jsMatch = content.match(/exec (?:\"\$basedir\/node\"|node)\s+\"\$basedir\/([^"\r\n]*codex\.js)\"/i);
    if (!jsMatch) {
      return null;
    }

    return join(dirname(shimPath), jsMatch[1]);
  } catch {
    return null;
  }
}

function resolvePosixCodexLaunch(
  cliPath: string,
  args: string[],
): { command: string; args: string[] } | null {
  if (posixCodexLaunchCache.has(cliPath)) {
    const cached = posixCodexLaunchCache.get(cliPath);
    return cached ? { command: cached.command, args: [...cached.args, ...args] } : null;
  }

  const codexJsPath = extractCodexJsFromPosixShim(cliPath);
  if (!codexJsPath) {
    posixCodexLaunchCache.set(cliPath, null);
    return null;
  }

  const resolved = {
    command: process.execPath,
    args: [codexJsPath],
  };
  posixCodexLaunchCache.set(cliPath, resolved);
  return { command: resolved.command, args: [...resolved.args, ...args] };
}

function resolveWindowsCodexLaunch(
  cliPath: string,
  args: string[],
): { command: string; args: string[] } | null {
  if (windowsCodexLaunchCache.has(cliPath)) {
    const cached = windowsCodexLaunchCache.get(cliPath);
    return cached ? { command: cached.command, args: [...cached.args, ...args] } : null;
  }

  try {
    const cmdShimPath = resolveWindowsCmdShimPath(cliPath);
    if (!cmdShimPath) {
      windowsCodexLaunchCache.set(cliPath, null);
      return null;
    }

    const codexJsPath = extractCodexJsFromCmdShim(cmdShimPath);
    if (!codexJsPath) {
      windowsCodexLaunchCache.set(cliPath, null);
      return null;
    }

    const resolved = {
      command: process.execPath,
      args: [codexJsPath],
    };
    windowsCodexLaunchCache.set(cliPath, resolved);
    return { command: resolved.command, args: [...resolved.args, ...args] };
  } catch {
    windowsCodexLaunchCache.set(cliPath, null);
    return null;
  }
}

function resolveCodexSpawnPlan(
  cliPath: string,
  args: string[],
): { command: string; args: string[]; usesWindowsShell: boolean } {
  const isWinCmd =
    process.platform === 'win32' &&
    (/\.(cmd|bat)$/i.test(cliPath) || cliPath === 'codex');
  const isPosixShim =
    process.platform !== 'win32' &&
    (isAbsolute(cliPath) || cliPath.includes('/'));
  const directWindowsLaunch = isWinCmd ? resolveWindowsCodexLaunch(cliPath, args) : null;
  const directPosixLaunch =
    !directWindowsLaunch && isPosixShim ? resolvePosixCodexLaunch(cliPath, args) : null;

  if (directWindowsLaunch) {
    return {
      command: directWindowsLaunch.command,
      args: directWindowsLaunch.args,
      usesWindowsShell: false,
    };
  }

  if (directPosixLaunch) {
    return {
      command: directPosixLaunch.command,
      args: directPosixLaunch.args,
      usesWindowsShell: false,
    };
  }

  if (isWinCmd) {
    return {
      command: 'cmd.exe',
      args: [
        '/d',
        '/s',
        '/c',
        `chcp 65001>nul && ${formatWindowsCommandName(cliPath)} ${args.map(quoteForWindowsCmd).join(' ')}`,
      ],
      usesWindowsShell: true,
    };
  }

  return {
    command: cliPath,
    args,
    usesWindowsShell: false,
  };
}

function readHelpTextOutput(
  cliPath: string,
  args: string[],
): { text: string; unavailable: boolean } {
  const plan = resolveCodexSpawnPlan(cliPath, args);
  try {
    return {
      text: execFileSync(plan.command, plan.args, {
        stdio: 'pipe',
        windowsHide: process.platform === 'win32',
      }).toString(),
      unavailable: false,
    };
  } catch (error) {
    const failure = error as {
      stdout?: Buffer | string;
      stderr?: Buffer | string;
      code?: string;
    };
    if (failure.code === 'ENOENT') {
      return { text: '', unavailable: true };
    }
    const stdout = failure.stdout ? String(failure.stdout) : '';
    const stderr = failure.stderr ? String(failure.stderr) : '';
    return {
      text: `${stdout}\n${stderr}`.trim(),
      unavailable: false,
    };
  }
}

function supportsStdinDashPrompt(cliPath: string): boolean | null {
  if (stdinDashSupportCache.has(cliPath)) {
    return stdinDashSupportCache.get(cliPath) ?? false;
  }

  const helpOutput = readHelpTextOutput(cliPath, ['exec', '--help']);
  if (helpOutput.unavailable) {
    return null;
  }
  const supported =
    /read from stdin/i.test(helpOutput.text)
    || /if [`'"]?-[`'"]? is used/i.test(helpOutput.text);

  stdinDashSupportCache.set(cliPath, supported);
  return supported;
}

function inlinePromptCharLimit(cliPath: string): number {
  const plan = resolveCodexSpawnPlan(cliPath, []);
  return plan.usesWindowsShell
    ? WINDOWS_SHELL_INLINE_PROMPT_CHAR_LIMIT
    : INLINE_PROMPT_CHAR_LIMIT;
}

function commandExists(cliPath: string): boolean {
  const candidate = cliPath.trim();
  if (!candidate) return false;

  if (
    (process.platform === 'win32' && /\.(cmd|bat)$/i.test(candidate))
    || isAbsolute(candidate)
    || candidate.includes('/')
    || candidate.includes('\\')
  ) {
    return existsSync(candidate) || resolveWindowsCmdShimPath(candidate) !== null;
  }

  const resolver = process.platform === 'win32' ? 'where' : 'which';
  try {
    execFileSync(resolver, [candidate], {
      stdio: 'pipe',
      windowsHide: process.platform === 'win32',
    });
    return true;
  } catch {
    return false;
  }
}

function helpSupportsOption(helpText: string, option: string): boolean {
  return helpText.includes(option);
}

export function inspectCodexCli(cliPath: string): CodexCliInspection {
  if (codexCliInspectionCache.has(cliPath)) {
    return codexCliInspectionCache.get(cliPath)!;
  }

  const inlineLimit = inlinePromptCharLimit(cliPath);
  if (!commandExists(cliPath)) {
    const inspection: CodexCliInspection = {
      commandReady: false,
      relaydeskCompatible: false,
      supportsStdinDashPrompt: null,
      supportsSkipGitRepoCheck: null,
      supportsCd: null,
      supportsFullAuto: null,
      supportsDangerousBypass: null,
      supportsSandbox: null,
      supportsModel: null,
      supportsImage: null,
      supportsExecJson: null,
      inlinePromptCharLimit: inlineLimit,
      issue: `Codex CLI 不可执行：${cliPath}`,
    };
    codexCliInspectionCache.set(cliPath, inspection);
    return inspection;
  }

  const globalHelp = readHelpTextOutput(cliPath, ['--help']);
  const execHelp = readHelpTextOutput(cliPath, ['exec', '--help']);
  if (globalHelp.unavailable || execHelp.unavailable) {
    const inspection: CodexCliInspection = {
      commandReady: true,
      relaydeskCompatible: false,
      supportsStdinDashPrompt: null,
      supportsSkipGitRepoCheck: null,
      supportsCd: null,
      supportsFullAuto: null,
      supportsDangerousBypass: null,
      supportsSandbox: null,
      supportsModel: null,
      supportsImage: null,
      supportsExecJson: null,
      inlinePromptCharLimit: inlineLimit,
      issue: '无法读取 Codex CLI 帮助信息，RelayDesk 不能确认当前版本是否兼容。',
    };
    codexCliInspectionCache.set(cliPath, inspection);
    return inspection;
  }

  const supportsCd = helpSupportsOption(globalHelp.text, '--cd');
  const supportsFullAuto = helpSupportsOption(globalHelp.text, '--full-auto');
  const supportsDangerousBypass = helpSupportsOption(
    globalHelp.text,
    '--dangerously-bypass-approvals-and-sandbox',
  );
  const supportsSandbox = helpSupportsOption(globalHelp.text, '--sandbox');
  const supportsModel = helpSupportsOption(globalHelp.text, '--model');
  const supportsImage = helpSupportsOption(globalHelp.text, '--image');
  const supportsExecJson = helpSupportsOption(execHelp.text, '--json');
  const supportsSkipGitRepoCheck = helpSupportsOption(execHelp.text, '--skip-git-repo-check');
  const stdinSupport = supportsStdinDashPrompt(cliPath);
  const incompatibilities: string[] = [];

  if (!supportsCd) incompatibilities.push('--cd');
  if (!supportsFullAuto) incompatibilities.push('--full-auto');
  if (!supportsDangerousBypass) incompatibilities.push('--dangerously-bypass-approvals-and-sandbox');
  if (!supportsSandbox) incompatibilities.push('--sandbox');
  if (!supportsExecJson) incompatibilities.push('exec --json');

  const inspection: CodexCliInspection = {
    commandReady: true,
    relaydeskCompatible: incompatibilities.length === 0,
    supportsStdinDashPrompt: stdinSupport,
    supportsSkipGitRepoCheck,
    supportsCd,
    supportsFullAuto,
    supportsDangerousBypass,
    supportsSandbox,
    supportsModel,
    supportsImage,
    supportsExecJson,
    inlinePromptCharLimit: inlineLimit,
    issue: incompatibilities.length
      ? `当前 Codex CLI 与 RelayDesk 不兼容，缺少：${incompatibilities.join('、')}`
      : null,
  };
  codexCliInspectionCache.set(cliPath, inspection);
  return inspection;
}

export function buildCodexLaunchSpec(
  cliPath: string,
  prompt: string,
  sessionId: string | undefined,
  workDir: string,
  options?: CodexRunOptions,
): CodexLaunchSpec {
  const inspection = inspectCodexCli(cliPath);
  if (!inspection.commandReady || !inspection.relaydeskCompatible) {
    throw new Error(inspection.issue ?? `Codex CLI 不可用：${cliPath}`);
  }

  if (!prompt.trim()) {
    return {
      args: buildCodexArgs(prompt, sessionId, workDir, options, '', inspection),
      promptTransport: 'argv',
    };
  }

  if (prompt.length <= inspection.inlinePromptCharLimit) {
    return {
      args: buildCodexArgs(prompt, sessionId, workDir, options, prompt, inspection),
      promptTransport: 'argv',
    };
  }

  const stdinDashSupported = inspection.supportsStdinDashPrompt;
  if (stdinDashSupported === null) {
    throw new Error(
      `无法检测 Codex CLI 是否支持 stdin prompt，请先确认 CLI 路径可执行：${cliPath}`,
    );
  }

  if (stdinDashSupported) {
    return {
      args: buildCodexArgs(prompt, sessionId, workDir, options, '-', inspection),
      promptTransport: 'stdin-dash',
      stdinPayload: prompt,
    };
  }

  throw new Error(
    '当前 Codex CLI 不支持使用 `-` 从 stdin 读取 prompt，且本次输入过长，无法安全以内联参数传递。请升级 Codex CLI，或缩短输入后重试。',
  );
}

export function runCodex(
  cliPath: string,
  prompt: string,
  sessionId: string | undefined,
  workDir: string,
  callbacks: CodexRunCallbacks,
  options?: CodexRunOptions,
): CodexRunHandle {
  const launchSpec = buildCodexLaunchSpec(cliPath, prompt, sessionId, workDir, options);
  const args = launchSpec.args;

  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  if (options?.chatId) env.CC_IM_CHAT_ID = options.chatId;
  if (options?.hookPort) env.CC_IM_HOOK_PORT = String(options.hookPort);
  if (options?.hookToken) env.CC_IM_HOOK_TOKEN = options.hookToken;
  if (options?.proxy) {
    env.HTTPS_PROXY = options.proxy;
    env.HTTP_PROXY = options.proxy;
    env.https_proxy = options.proxy;
    env.http_proxy = options.proxy;
    env.ALL_PROXY = options.proxy;
    env.all_proxy = options.proxy;
  }
  if (process.platform === 'win32') {
    env.LANG = env.LANG || 'C.UTF-8';
    env.LC_ALL = env.LC_ALL || 'C.UTF-8';
  }

  const argsForLog = args.join(' ');
  log.info(
    `Spawning Codex CLI: path=${cliPath}, cwd=${workDir}, session=${sessionId ?? 'new'}, transport=${launchSpec.promptTransport}, args=${argsForLog}`,
  );

  const spawnPlan = resolveCodexSpawnPlan(cliPath, args);
  const spawnCmd = spawnPlan.command;
  const spawnArgs = spawnPlan.args;

  const child = spawn(spawnCmd, spawnArgs, {
    cwd: workDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
    windowsHide: process.platform === 'win32',
  });

  if (launchSpec.promptTransport === 'stdin-dash' && launchSpec.stdinPayload) {
    child.stdin?.write(launchSpec.stdinPayload);
  }
  child.stdin?.end();

  let accumulated = '';
  let accumulatedThinking = '';
  let completed = false;
  const toolStats: Record<string, number> = {};
  const emittedGeneratedImages = new Set<string>();
  const emittedGeneratedFiles = new Set<string>();
  const startTime = Date.now();

  const timeoutMs = resolveRunTimeoutMs(options?.timeoutMs);
  const idleTimeoutMs = resolveCodexIdleTimeoutMs(options?.idleTimeoutMs, timeoutMs);

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let idleTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const rl = createInterface({ input: child.stdout! });

  const clearTimers = () => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    if (idleTimeoutHandle) {
      clearTimeout(idleTimeoutHandle);
      idleTimeoutHandle = null;
    }
  };

  const failAndTerminate = (message: string, logMessage: string) => {
    if (completed) return;
    completed = true;
    clearTimers();
    log.warn(logMessage);
    rl.close();
    if (!child.killed) child.kill('SIGTERM');
    callbacks.onError(message);
  };

  const resetIdleTimeout = () => {
    if (idleTimeoutMs <= 0 || completed) return;
    if (idleTimeoutHandle) clearTimeout(idleTimeoutHandle);
    idleTimeoutHandle = setTimeout(() => {
      failAndTerminate(
        `Codex 执行空闲超时（${idleTimeoutMs}ms 内无输出），已自动终止`,
        `Codex CLI idle timeout after ${idleTimeoutMs}ms, killing pid=${child.pid}`,
      );
    }, idleTimeoutMs);
  };

  if (timeoutMs > 0) {
    timeoutHandle = setTimeout(() => {
      if (!completed && !child.killed) {
        failAndTerminate(
          `Codex 执行总超时（${timeoutMs}ms），已终止进程`,
          `Codex CLI timeout after ${timeoutMs}ms, killing pid=${child.pid}`,
        );
      }
    }, timeoutMs);
  }
  resetIdleTimeout();

  const MAX_STDERR_HEAD = 4 * 1024;
  const MAX_STDERR_TAIL = 6 * 1024;
  let stderrHead = '';
  let stderrTail = '';
  let stderrTotal = 0;
  let stderrHeadFull = false;

  child.stderr?.on('data', (chunk: Buffer) => {
    resetIdleTimeout();
    const text = chunk.toString();
    stderrTotal += text.length;
    if (!stderrHeadFull) {
      const room = MAX_STDERR_HEAD - stderrHead.length;
      if (room > 0) {
        stderrHead += text.slice(0, room);
        if (stderrHead.length >= MAX_STDERR_HEAD) stderrHeadFull = true;
      }
    }
    stderrTail += text;
    if (stderrTail.length > MAX_STDERR_TAIL) {
      stderrTail = stderrTail.slice(-MAX_STDERR_TAIL);
    }
    log.debug(`[stderr] ${text.trimEnd()}`);
  });

  rl.on('line', (line) => {
    resetIdleTimeout();
    const event = parseCodexEvent(line);
    if (!event) return;

    const type = event.type as string;
    log.debug(`[Codex event] type=${type}`);

    if (type === 'thread.started') {
      const threadId = (event.thread_id as string) ?? '';
      if (threadId) callbacks.onSessionId?.(threadId);
      return;
    }

    if (type === 'turn.failed') {
      completed = true;
      clearTimers();
      const err = event.error as { message?: string } | undefined;
      callbacks.onError(err?.message ?? 'Codex turn failed');
      return;
    }

    if (type === 'error') {
      const msg = event.message as string | undefined;
      if (msg?.includes('Reconnecting')) {
        return;
      }
      completed = true;
      clearTimers();
      callbacks.onError(msg ?? 'Codex stream error');
      return;
    }

    if (type === 'item.started' || type === 'item.updated' || type === 'item.completed') {
      const item = event.item as Record<string, unknown> | undefined;
      if (!item) return;

      const itemType = item.type as string;

      if (itemType === 'reasoning' && type === 'item.completed') {
        const text = item.text as string | undefined;
        if (text) {
          accumulatedThinking += (accumulatedThinking ? '\n\n' : '') + text;
          callbacks.onThinking?.(accumulatedThinking);
        }
        return;
      }

      if (itemType === 'command_execution') {
        const cmd = item.command as string | undefined;
        if (cmd && type === 'item.started') {
          const toolName = 'Bash';
          toolStats[toolName] = (toolStats[toolName] || 0) + 1;
          callbacks.onToolUse?.(toolName, { command: cmd });
        }
        return;
      }

      if (itemType === 'file_change' && type === 'item.completed') {
        const changes = item.changes as Array<{ path?: string; kind?: string }> | undefined;
        const toolName = 'Edit';
        toolStats[toolName] = (toolStats[toolName] || 0) + 1;
        callbacks.onToolUse?.(toolName, { changes });
        for (const imagePath of extractGeneratedImagePaths(changes, workDir)) {
          if (emittedGeneratedImages.has(imagePath)) continue;
          emittedGeneratedImages.add(imagePath);
          callbacks.onGeneratedImage?.(imagePath);
        }
        for (const filePath of extractGeneratedFilePaths(changes, workDir)) {
          if (emittedGeneratedFiles.has(filePath)) continue;
          emittedGeneratedFiles.add(filePath);
          callbacks.onGeneratedFile?.(filePath);
        }
        return;
      }

      if (itemType === 'mcp_tool_call' && type === 'item.started') {
        const tool = item.tool as string | undefined;
        const server = item.server as string | undefined;
        if (tool) {
          const displayName = server ? `${server}/${tool}` : tool;
          toolStats[displayName] = (toolStats[displayName] || 0) + 1;
          callbacks.onToolUse?.(displayName, item.arguments as Record<string, unknown>);
        }
        return;
      }

      if (itemType === 'agent_message' && type === 'item.completed') {
        const text = item.text as string | undefined;
        if (text) {
          accumulated += (accumulated ? '\n\n' : '') + text;
          callbacks.onText(accumulated);
        }
        return;
      }
    }

    if (type === 'turn.completed') {
      completed = true;
      clearTimers();
      callbacks.onComplete({
        success: true,
        result: accumulated,
        accumulated,
        cost: 0,
        durationMs: Date.now() - startTime,
        numTurns: 1,
        toolStats,
      });
    }
  });

  let exitCode: number | null = null;
  let rlClosed = false;
  let childClosed = false;

  const finalize = () => {
    if (!rlClosed || !childClosed) return;
    clearTimers();
    if (completed) return;

    if (exitCode !== null && exitCode !== 0) {
      let errMsg = '';
      if (stderrTotal > 0) {
        if (!stderrHeadFull) {
          errMsg = stderrHead;
        } else if (stderrTotal <= MAX_STDERR_HEAD + MAX_STDERR_TAIL) {
          errMsg = stderrHead + stderrTail.slice(stderrTail.length - (stderrTotal - MAX_STDERR_HEAD));
        } else {
          errMsg =
            stderrHead +
            `\n\n... (omitted ${stderrTotal - MAX_STDERR_HEAD - MAX_STDERR_TAIL} bytes) ...\n\n` +
            stderrTail;
        }
      }
      if (
        sessionId &&
        (errMsg.includes('No session found') ||
          errMsg.includes('No conversation found') ||
          errMsg.includes('Unable to find session'))
      ) {
        callbacks.onSessionInvalid?.();
      }
      callbacks.onError(errMsg || `Codex CLI exited with code ${exitCode}`);
      return;
    }

    callbacks.onComplete({
      success: true,
      result: accumulated,
      accumulated,
      cost: 0,
      durationMs: Date.now() - startTime,
      numTurns: 0,
      toolStats,
    });
  };

  child.on('close', (code) => {
    log.info(`Codex CLI closed: exitCode=${code}, pid=${child.pid}`);
    exitCode = code;
    childClosed = true;
    finalize();
  });

  rl.on('close', () => {
    rlClosed = true;
    finalize();
  });

  child.on('error', (err) => {
    const errorCode = (err as NodeJS.ErrnoException).code;
    log.error(`Codex CLI spawn error: ${err.message}, code=${errorCode}, path=${cliPath}`);
    clearTimers();
    if (!completed) {
      completed = true;
      callbacks.onError(`Failed to start Codex CLI: ${err.message}`);
    }
    childClosed = true;
    finalize();
  });

  return {
    abort: () => {
      completed = true;
      clearTimers();
      rl.close();
      if (!child.killed) child.kill('SIGTERM');
    },
  };
}
