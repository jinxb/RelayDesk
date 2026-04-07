import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { APP_HOME } from '../constants.js';

const ACTIVE_CHATS_FILE = join(APP_HOME, 'data', 'active-chats.json');
type Platform = 'dingtalk' | 'feishu' | 'qq' | 'telegram' | 'wechat' | 'wework';
const knownPlatforms: readonly Platform[] = ['dingtalk', 'feishu', 'qq', 'telegram', 'wechat', 'wework'];

export interface DingTalkActiveTarget {
  chatId: string;
  userId?: string;
  conversationType?: string;
  robotCode?: string;
  updatedAt: number;
}

export interface ActiveRouteAnchor {
  chatId: string;
  userId?: string;
  updatedAt: number;
}

interface Data {
  dingtalk?: string | ActiveRouteAnchor;
  dingtalkTarget?: DingTalkActiveTarget;
  feishu?: string | ActiveRouteAnchor;
  qq?: string | ActiveRouteAnchor;
  telegram?: string | ActiveRouteAnchor;
  wechat?: string | ActiveRouteAnchor;
  wework?: string | ActiveRouteAnchor;
}

let data: Data = {};
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function isValidDingTalkActiveTarget(value: unknown): value is DingTalkActiveTarget {
  if (!value || typeof value !== 'object') return false;
  const target = value as Record<string, unknown>;
  return (
    typeof target.chatId === 'string' &&
    target.chatId.length > 0 &&
    (target.userId === undefined || typeof target.userId === 'string') &&
    (target.conversationType === undefined || typeof target.conversationType === 'string') &&
    (target.robotCode === undefined || typeof target.robotCode === 'string') &&
    typeof target.updatedAt === 'number'
  );
}

function isValidActiveRouteAnchor(value: unknown): value is ActiveRouteAnchor {
  if (!value || typeof value !== 'object') return false;
  const target = value as Record<string, unknown>;
  return (
    typeof target.chatId === 'string' &&
    target.chatId.length > 0 &&
    (target.userId === undefined || typeof target.userId === 'string') &&
    typeof target.updatedAt === 'number'
  );
}

function normalizeData(input: Data): Data {
  const normalized: Data = {};
  for (const platform of knownPlatforms) {
    const value = input[platform];
    if (typeof value === 'string' && value) {
      normalized[platform] = {
        chatId: value,
        updatedAt: 0,
      };
      continue;
    }
    if (isValidActiveRouteAnchor(value)) {
      normalized[platform] = value;
    }
  }
  if (isValidDingTalkActiveTarget(input.dingtalkTarget)) {
    normalized.dingtalkTarget = input.dingtalkTarget;
  }
  return normalized;
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      await mkdir(dirname(ACTIVE_CHATS_FILE), { recursive: true });
      await writeFile(ACTIVE_CHATS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      /* ignore */
    }
  }, 500);
}

export function loadActiveChats(): void {
  try {
    if (existsSync(ACTIVE_CHATS_FILE)) {
      data = normalizeData(JSON.parse(readFileSync(ACTIVE_CHATS_FILE, 'utf-8')));
    }
  } catch {
    data = {};
  }
}

export function getActiveChatId(platform: Platform): string | undefined {
  const value = data[platform];
  if (typeof value === 'string') {
    return value;
  }
  return value?.chatId;
}

export function getActiveRouteAnchor(platform: Platform): ActiveRouteAnchor | undefined {
  const value = data[platform];
  if (typeof value === 'string') {
    return {
      chatId: value,
      updatedAt: 0,
    };
  }
  return isValidActiveRouteAnchor(value) ? value : undefined;
}

export function setActiveRouteAnchor(
  platform: Platform,
  anchor: Omit<ActiveRouteAnchor, 'updatedAt'>,
): void {
  if (!anchor.chatId) return;
  const next: ActiveRouteAnchor = {
    ...anchor,
    updatedAt: Date.now(),
  };
  const previous = getActiveRouteAnchor(platform);
  if (
    previous?.chatId === next.chatId &&
    previous?.userId === next.userId
  ) {
    return;
  }
  data[platform] = next;
  scheduleSave();
}

export function setActiveChatId(platform: Platform, chatId: string): void {
  if (getActiveChatId(platform) === chatId) return;
  data[platform] = {
    chatId,
    updatedAt: Date.now(),
  };
  scheduleSave();
}

export function getDingTalkActiveTarget(): DingTalkActiveTarget | undefined {
  return isValidDingTalkActiveTarget(data.dingtalkTarget) ? data.dingtalkTarget : undefined;
}

export function setDingTalkActiveTarget(
  target: Omit<DingTalkActiveTarget, 'updatedAt'>,
): void {
  if (!target.chatId) return;

  const nextTarget: DingTalkActiveTarget = {
    ...target,
    updatedAt: Date.now(),
  };

  const prevTarget = data.dingtalkTarget;
  data.dingtalk = {
    chatId: target.chatId,
    userId: target.userId,
    updatedAt: nextTarget.updatedAt,
  };
  data.dingtalkTarget = nextTarget;

  if (
    prevTarget?.chatId === nextTarget.chatId &&
    prevTarget?.userId === nextTarget.userId &&
    prevTarget?.conversationType === nextTarget.conversationType &&
    prevTarget?.robotCode === nextTarget.robotCode
  ) {
    return;
  }

  scheduleSave();
}

export function flushActiveChats(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    const dir = dirname(ACTIVE_CHATS_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(ACTIVE_CHATS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    /* ignore */
  }
}
