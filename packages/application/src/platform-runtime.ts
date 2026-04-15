import {
  createLogger,
  getActiveChatId,
  resolvePlatformAiCommand,
  type Config,
  type SessionManager,
} from "../../state/src/index.js";
import { escapePathForMarkdown } from "../../interaction/src/index.js";
import type { Logger } from "./types.js";
import {
  explainDingTalkInitError,
  sendDingTalkLifecycleNotice,
  sendFeishuLifecycleNotice,
  sendQQLifecycleNotice,
  sendTelegramLifecycleNotice,
  sendWeChatLifecycleNotice,
  sendWeComLifecycleNotice,
  resolveTelegramWorkspace,
  startTelegramChannel,
  stopTelegramChannel,
  startQQChannel,
  stopQQChannel,
  type QQChannelHandle,
  type TelegramChannelHandle,
  startWeChatChannel,
  stopWeChatChannel,
  type WeChatChannelHandle,
  startDingTalkChannel,
  stopDingTalkChannel,
  type DingTalkChannelHandle,
  resolveWeComWorkspace,
  startWeComChannel,
  stopWeComChannel,
  type WeComChannelHandle,
  startFeishuChannel,
  stopFeishuChannel,
  type FeishuChannelHandle,
} from "../../channels/src/index.js";
import type { ChannelRuntimeServices } from "../../channels/src/runtime-services.js";

export type RuntimeChannel =
  | "telegram"
  | "feishu"
  | "qq"
  | "wechat"
  | "wework"
  | "dingtalk";

export interface PlatformRuntimeHandles {
  telegramHandle: TelegramChannelHandle | null;
  feishuHandle: FeishuChannelHandle | null;
  qqHandle: QQChannelHandle | null;
  wechatHandle: WeChatChannelHandle | null;
  weworkHandle: WeComChannelHandle | null;
  dingtalkHandle: DingTalkChannelHandle | null;
}

export interface PlatformRuntimeStartResult {
  handles: PlatformRuntimeHandles;
  readyChannels: RuntimeChannel[];
  failedChannels: PlatformStartupFailure[];
}

export interface PlatformStartupFailure {
  channel: RuntimeChannel;
  message: string;
}

type LifecycleNoticeSender = (message: string) => Promise<void>;
type StopChannelEntry = {
  readonly channel: RuntimeChannel;
  readonly stop: () => void | Promise<void>;
};

const log = createLogger("PlatformRuntime");

function emptyHandles(): PlatformRuntimeHandles {
  return {
    telegramHandle: null,
    feishuHandle: null,
    qqHandle: null,
    wechatHandle: null,
    weworkHandle: null,
    dingtalkHandle: null,
  };
}

function describeStartupError(
  channel: RuntimeChannel,
  error: unknown,
): string {
  if (channel === "dingtalk") {
    return explainDingTalkInitError(error);
  }
  return error instanceof Error ? error.message : String(error);
}

async function startChannel(options: {
  enabled: boolean;
  channel: RuntimeChannel;
  start: () => Promise<unknown>;
  assign: (handle: unknown) => void;
  readyChannels: RuntimeChannel[];
  failedChannels: PlatformStartupFailure[];
  log: Logger;
}) {
  if (!options.enabled) {
    return;
  }

  try {
    const handle = await options.start();
    options.assign(handle);
    options.readyChannels.push(options.channel);
  } catch (error) {
    const message = describeStartupError(options.channel, error);
    options.failedChannels.push({ channel: options.channel, message });
    options.log.error(`${options.channel} initialization failed:`, error);
  }
}

async function sendLoggedLifecycleNotice(
  channel: RuntimeChannel,
  message: string,
  sender: LifecycleNoticeSender,
): Promise<void> {
  try {
    await sender(message);
  } catch (error) {
    log.warn(`Failed to send ${channel} lifecycle notice:`, error);
    log.debug("Lifecycle notice payload:", message);
  }
}

async function stopChannelWithLogging(
  channel: RuntimeChannel,
  stop: () => void | Promise<void>,
): Promise<void> {
  try {
    await stop();
  } catch (error) {
    log.error(`Failed to stop ${channel} channel:`, error);
  }
}

function enqueueLifecycleNotice(
  work: Promise<void>[],
  active: boolean,
  channel: RuntimeChannel,
  message: string,
  sender: LifecycleNoticeSender,
) {
  if (!active) return;
  work.push(sendLoggedLifecycleNotice(channel, message, sender));
}

export async function sendLifecycleNotice(
  channel: RuntimeChannel,
  message: string,
): Promise<void> {
  const telegramChatId = getActiveChatId("telegram");
  const feishuChatId = getActiveChatId("feishu");
  const qqChatId = getActiveChatId("qq");
  const wechatChatId = getActiveChatId("wechat");
  const weworkChatId = getActiveChatId("wework");
  const work: Promise<void>[] = [];

  enqueueLifecycleNotice(
    work,
    channel === "telegram" && Boolean(telegramChatId),
    "telegram",
    message,
    sendTelegramLifecycleNotice,
  );
  enqueueLifecycleNotice(
    work,
    channel === "feishu" && Boolean(feishuChatId),
    "feishu",
    message,
    sendFeishuLifecycleNotice,
  );
  enqueueLifecycleNotice(
    work,
    channel === "qq" && Boolean(qqChatId),
    "qq",
    message,
    sendQQLifecycleNotice,
  );
  enqueueLifecycleNotice(
    work,
    channel === "wechat" && Boolean(wechatChatId),
    "wechat",
    message,
    sendWeChatLifecycleNotice,
  );
  enqueueLifecycleNotice(
    work,
    channel === "wework" && Boolean(weworkChatId),
    "wework",
    message,
    sendWeComLifecycleNotice,
  );
  enqueueLifecycleNotice(
    work,
    channel === "dingtalk",
    "dingtalk",
    message,
    sendDingTalkLifecycleNotice,
  );

  await Promise.all(work);
}

export function buildWorkerOnlineMessage(
  channel: RuntimeChannel,
  route: string,
  workTree: string,
  sessions: SessionManager,
) {
  let currentTree: string | undefined;
  if (channel === "telegram") currentTree = resolveTelegramWorkspace(sessions);
  if (channel === "wework") currentTree = resolveWeComWorkspace(sessions);

  const lines = [
    "**RelayDesk worker online**",
    "",
    `- route: \`${route}\``,
    `- channel: \`${channel}\``,
    `- workspace: ${
      currentTree
        ? escapePathForMarkdown(currentTree)
        : escapePathForMarkdown(workTree)
    }`,
  ];

  return lines.join("\n");
}

export function buildWorkerOfflineMessage(uptimeMinutes: number) {
  return [
    "**RelayDesk worker stopping**",
    "",
    `- uptime: \`${uptimeMinutes} min\``,
  ].join("\n");
}

export async function startConfiguredChannels(
  config: Config,
  sessions: SessionManager,
  log: Logger,
  services: ChannelRuntimeServices = {},
): Promise<PlatformRuntimeStartResult> {
  const handles = emptyHandles();
  const readyChannels: RuntimeChannel[] = [];
  const failedChannels: PlatformStartupFailure[] = [];

  await startChannel({
    enabled: config.enabledPlatforms.includes("telegram"),
    channel: "telegram",
    start: () => startTelegramChannel(config, sessions, services),
    assign: (handle) => {
      handles.telegramHandle = handle as TelegramChannelHandle;
    },
    readyChannels,
    failedChannels,
    log,
  });
  await startChannel({
    enabled: config.enabledPlatforms.includes("feishu"),
    channel: "feishu",
    start: () => startFeishuChannel(config, sessions, services),
    assign: (handle) => {
      handles.feishuHandle = handle as FeishuChannelHandle;
    },
    readyChannels,
    failedChannels,
    log,
  });
  await startChannel({
    enabled: config.enabledPlatforms.includes("qq"),
    channel: "qq",
    start: () => startQQChannel(config, sessions, services),
    assign: (handle) => {
      handles.qqHandle = handle as QQChannelHandle;
    },
    readyChannels,
    failedChannels,
    log,
  });
  await startChannel({
    enabled: config.enabledPlatforms.includes("wechat"),
    channel: "wechat",
    start: () => startWeChatChannel(config, sessions, services),
    assign: (handle) => {
      handles.wechatHandle = handle as WeChatChannelHandle;
    },
    readyChannels,
    failedChannels,
    log,
  });
  await startChannel({
    enabled: config.enabledPlatforms.includes("wework"),
    channel: "wework",
    start: () => startWeComChannel(config, sessions, services),
    assign: (handle) => {
      handles.weworkHandle = handle as WeComChannelHandle;
    },
    readyChannels,
    failedChannels,
    log,
  });
  await startChannel({
    enabled: config.enabledPlatforms.includes("dingtalk"),
    channel: "dingtalk",
    start: () => startDingTalkChannel(config, sessions, services),
    assign: (handle) => {
      handles.dingtalkHandle = handle as DingTalkChannelHandle;
    },
    readyChannels,
    failedChannels,
    log,
  });

  return { handles, readyChannels, failedChannels };
}

export async function stopConfiguredChannels(options: {
  readonly activeChannels: readonly RuntimeChannel[];
  readonly handles: PlatformRuntimeHandles;
}) {
  const stopEntries: readonly StopChannelEntry[] = [
    {
      channel: "telegram",
      stop: () => stopTelegramChannel(options.handles.telegramHandle),
    },
    {
      channel: "feishu",
      stop: () => stopFeishuChannel(options.handles.feishuHandle),
    },
    {
      channel: "qq",
      stop: () => stopQQChannel(options.handles.qqHandle),
    },
    {
      channel: "wechat",
      stop: () => stopWeChatChannel(options.handles.wechatHandle),
    },
    {
      channel: "wework",
      stop: () => stopWeComChannel(options.handles.weworkHandle),
    },
    {
      channel: "dingtalk",
      stop: () => stopDingTalkChannel(options.handles.dingtalkHandle),
    },
  ];

  for (const entry of stopEntries) {
    if (!options.activeChannels.includes(entry.channel)) {
      continue;
    }
    await stopChannelWithLogging(entry.channel, entry.stop);
  }
}

export async function publishOnlineNotices(
  readyChannels: RuntimeChannel[],
  config: Config,
  workTree: string,
  sessions: SessionManager,
) {
  for (const channel of readyChannels) {
    const route = resolvePlatformAiCommand(config, channel);
    await sendLifecycleNotice(
      channel,
      buildWorkerOnlineMessage(channel, route, workTree, sessions),
    );
  }
}

export async function publishOfflineNotices(
  readyChannels: RuntimeChannel[],
  uptimeMinutes: number,
) {
  const message = buildWorkerOfflineMessage(uptimeMinutes);
  for (const channel of readyChannels) {
    await sendLifecycleNotice(channel, message);
  }
}
