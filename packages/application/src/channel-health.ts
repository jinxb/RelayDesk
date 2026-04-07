import type { FileConfig } from "../../state/src/index.js";
import {
  getWeChatConfigIssue,
  hasWeChatIlinkCredentials,
} from "../../state/src/wechat-route.js";

export type HealthState = {
  configured: boolean;
  enabled: boolean;
  healthy: boolean;
  message?: string;
};

function flag(value: unknown): boolean {
  return Boolean(value);
}

function resolveWeChatRouteConfig(
  file: FileConfig["platforms"] extends infer T
    ? T extends { wechat?: infer U }
      ? U | undefined
      : never
    : never,
  env: NodeJS.ProcessEnv,
) {
  const source = (file ?? {}) as Record<string, unknown>;
  return {
    token: env.WECHAT_TOKEN ?? source.token,
    baseUrl: env.WECHAT_BASE_URL ?? source.baseUrl,
    appId: env.WECHAT_APP_ID ?? source.appId,
    appSecret: env.WECHAT_APP_SECRET ?? source.appSecret,
    guid: env.WECHAT_GUID ?? source.guid,
    userId: env.WECHAT_USER_ID ?? source.userId,
    wsUrl: env.WECHAT_WS_URL ?? source.wsUrl,
  };
}

function resolveWeChatHealthState(
  wechat: FileConfig["platforms"] extends infer T
    ? T extends { wechat?: infer U }
      ? U | undefined
      : never
    : never,
  env: NodeJS.ProcessEnv,
): HealthState {
  const routeConfig = resolveWeChatRouteConfig(wechat, env);
  const configured = hasWeChatIlinkCredentials(routeConfig);

  if (configured) {
    return {
      configured: true,
      enabled: wechat?.enabled !== false,
      healthy: true,
      message: "ilink/getupdates credentials are in place.",
    };
  }

  return {
    configured: false,
    enabled: false,
    healthy: false,
    message: getWeChatConfigIssue(routeConfig),
  };
}

export function getChannelHealthSnapshot(
  file: FileConfig,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, HealthState> {
  const telegram = file.platforms?.telegram;
  const feishu = file.platforms?.feishu;
  const qq = file.platforms?.qq;
  const wework = file.platforms?.wework;
  const dingtalk = file.platforms?.dingtalk;
  const wechat = file.platforms?.wechat;

  const telegramToken =
    env.TELEGRAM_BOT_TOKEN ?? telegram?.botToken ?? file.telegramBotToken;
  const feishuAppId =
    env.FEISHU_APP_ID ?? feishu?.appId ?? file.feishuAppId;
  const feishuAppSecret =
    env.FEISHU_APP_SECRET ?? feishu?.appSecret ?? file.feishuAppSecret;
  const qqAppId = env.QQ_BOT_APPID ?? env.QQ_APP_ID ?? qq?.appId;
  const qqSecret = env.QQ_BOT_SECRET ?? env.QQ_SECRET ?? qq?.secret;
  const weworkCorpId = env.WEWORK_CORP_ID ?? wework?.corpId;
  const weworkSecret = env.WEWORK_SECRET ?? wework?.secret;
  const dingtalkClientId = env.DINGTALK_CLIENT_ID ?? dingtalk?.clientId;
  const dingtalkClientSecret =
    env.DINGTALK_CLIENT_SECRET ?? dingtalk?.clientSecret;
  return {
    telegram: {
      configured: flag(telegramToken),
      enabled: flag(telegramToken) && telegram?.enabled !== false,
      healthy: flag(telegramToken),
      message: telegramToken
        ? "Access token is present."
        : "No bot token has been supplied.",
    },
    feishu: {
      configured: flag(feishuAppId && feishuAppSecret),
      enabled: flag(feishuAppId && feishuAppSecret) && feishu?.enabled !== false,
      healthy: flag(feishuAppId && feishuAppSecret),
      message:
        feishuAppId && feishuAppSecret
          ? "App credentials are in place."
          : "App ID and secret are both required.",
    },
    qq: {
      configured: flag(qqAppId && qqSecret),
      enabled: flag(qqAppId && qqSecret) && qq?.enabled !== false,
      healthy: flag(qqAppId && qqSecret),
      message:
        qqAppId && qqSecret
          ? "Bot credentials are in place."
          : "App ID and secret are both required.",
    },
    wework: {
      configured: flag(weworkCorpId && weworkSecret),
      enabled: flag(weworkCorpId && weworkSecret) && wework?.enabled !== false,
      healthy: flag(weworkCorpId && weworkSecret),
      message:
        weworkCorpId && weworkSecret
          ? "Robot socket credentials are in place."
          : "Bot ID and secret are both required.",
    },
    dingtalk: {
      configured: flag(dingtalkClientId && dingtalkClientSecret),
      enabled:
        flag(dingtalkClientId && dingtalkClientSecret) &&
        dingtalk?.enabled !== false,
      healthy: flag(dingtalkClientId && dingtalkClientSecret),
      message:
        dingtalkClientId && dingtalkClientSecret
          ? "Application credentials are in place."
          : "Client ID and secret are both required.",
    },
    wechat: resolveWeChatHealthState(wechat, env),
  };
}
