import { createLogger, type Config } from '../../../state/src/index.js';
import {
  hasWeChatIlinkCredentials,
  WECHAT_ROUTE_REQUIRED_MESSAGE,
} from '../../../state/src/wechat-route.js';
import type { WeChatChannelState } from './types.js';
import {
  getWeChatRuntimeState,
  startWeChatRuntime,
  stopWeChatRuntime,
} from "./runtime.js";

const log = createLogger('WeChat');

function hasWeChatRuntimeConfig(config: Config): boolean {
  return hasWeChatIlinkCredentials({
    token: config.wechatToken,
    baseUrl: config.wechatBaseUrl,
  });
}

export async function initWeChat(
  config: Config,
  eventHandler: (data: unknown) => Promise<void>,
  onStateChange?: (state: WeChatChannelState) => void,
): Promise<void> {
  if (!hasWeChatRuntimeConfig(config)) {
    throw new Error(WECHAT_ROUTE_REQUIRED_MESSAGE);
  }

  await startWeChatRuntime({
    baseUrl: config.wechatBaseUrl!,
    token: config.wechatToken!,
    eventHandler,
    onStateChange,
  });
  log.info("WeChat ilink runtime started");
}

export function getChannelState(): WeChatChannelState {
  return getWeChatRuntimeState();
}

export function stopWeChat(): void {
  stopWeChatRuntime();
  log.info('WeChat client stopped');
}
