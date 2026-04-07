import type { Config } from "../../state/src/index.js";
import {
  getWeChatConfigIssue,
  hasWeChatIlinkCredentials,
} from "../../state/src/wechat-route.js";

const probeTimeoutMs = 10_000;

function requiredText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function expectKeys(
  channel: string,
  config: Record<string, unknown>,
): string[] {
  switch (channel) {
    case "telegram":
      return requiredText(config.botToken)
        ? []
        : ["Telegram requires a bot token."];
    case "feishu":
      return requiredText(config.appId) && requiredText(config.appSecret)
        ? []
        : ["Feishu requires both app ID and app secret."];
    case "qq":
      return requiredText(config.appId) && requiredText(config.secret)
        ? []
        : ["QQ requires both app ID and app secret."];
    case "wework":
      return requiredText(config.corpId) && requiredText(config.secret)
        ? []
        : ["WeCom requires both bot ID and secret."];
    case "dingtalk":
      return requiredText(config.clientId) && requiredText(config.clientSecret)
        ? []
        : ["DingTalk requires both client ID and client secret."];
    case "wechat":
      return hasWeChatIlinkCredentials(config)
        ? []
        : [getWeChatConfigIssue(config)];
    default:
      return [`Unknown channel: ${channel}`];
  }
}

function readJson(response: Response): Promise<Record<string, unknown>> {
  return response.text().then((text) => {
    if (!text) return {};
    return JSON.parse(text) as Record<string, unknown>;
  });
}

function probeConfig(values: Partial<Config>): Config {
  return {
    enabledPlatforms: [],
    runtime: {
      keepAwake: false,
    },
    allowedUserIds: [],
    telegramAllowedUserIds: [],
    feishuAllowedUserIds: [],
    qqAllowedUserIds: [],
    wechatAllowedUserIds: [],
    weworkAllowedUserIds: [],
    dingtalkAllowedUserIds: [],
    aiCommand: "claude",
    codexCliPath: "codex",
    codebuddyCliPath: "codebuddy",
    claudeWorkDir: process.cwd(),
    claudeTimeoutMs: 600000,
    codexTimeoutMs: 600000,
    codebuddyTimeoutMs: 600000,
    logDir: "",
    logLevel: "INFO",
    platforms: {},
    ...values,
  };
}

async function probeTelegram(config: Record<string, unknown>): Promise<string> {
  const token = requiredText(config.botToken);
  const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
    signal: AbortSignal.timeout(probeTimeoutMs),
  });
  const body = await readJson(response);

  if (!response.ok || body.ok !== true) {
    throw new Error(
      String(body.description ?? body.error_code ?? `HTTP ${response.status}`),
    );
  }

  const result = (body.result ?? {}) as Record<string, unknown>;
  const handle =
    typeof result.username === "string" ? `@${result.username}` : "bot";
  return `Telegram handshake succeeded for ${handle}.`;
}

async function probeFeishu(config: Record<string, unknown>): Promise<string> {
  const response = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        app_id: requiredText(config.appId),
        app_secret: requiredText(config.appSecret),
      }),
      signal: AbortSignal.timeout(probeTimeoutMs),
    },
  );
  const body = await readJson(response);

  if (!response.ok || body.code !== 0) {
    throw new Error(String(body.msg ?? body.message ?? `HTTP ${response.status}`));
  }

  return "Feishu token exchange succeeded.";
}

async function probeQQ(config: Record<string, unknown>): Promise<string> {
  const response = await fetch("https://bots.qq.com/app/getAppAccessToken", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      appId: requiredText(config.appId),
      clientSecret: requiredText(config.secret),
    }),
    signal: AbortSignal.timeout(probeTimeoutMs),
  });
  const body = await readJson(response);

  if (
    !response.ok ||
    typeof body.access_token !== "string" ||
    body.access_token.length === 0
  ) {
    throw new Error(String(body.message ?? `HTTP ${response.status}`));
  }

  const gateway = await fetch("https://api.sgroup.qq.com/gateway", {
    headers: {
      Authorization: `QQBot ${body.access_token}`,
    },
    signal: AbortSignal.timeout(probeTimeoutMs),
  });
  const gatewayBody = await readJson(gateway);
  if (!gateway.ok || typeof gatewayBody.url !== "string" || gatewayBody.url.length === 0) {
    throw new Error(String(gatewayBody.message ?? `HTTP ${gateway.status}`));
  }

  return "QQ token exchange and gateway reachability succeeded.";
}

async function probeWeCom(config: Record<string, unknown>): Promise<string> {
  const {
    initWeWorkClient,
    stopWeWorkClient,
  } = await import("../../channels/src/index.js");
  try {
    await initWeWorkClient(
      probeConfig({
        weworkCorpId: requiredText(config.corpId),
        weworkSecret: requiredText(config.secret),
        weworkWsUrl:
          typeof config.wsUrl === "string" ? config.wsUrl.trim() : undefined,
      }),
      async () => {},
    );
    return "WeCom robot socket authentication succeeded.";
  } finally {
      stopWeWorkClient();
  }
}

async function probeDingTalk(config: Record<string, unknown>): Promise<string> {
  const { DWClient } = await import("dingtalk-stream");
  const client = new DWClient({
    clientId: requiredText(config.clientId),
    clientSecret: requiredText(config.clientSecret),
    keepAlive: false,
    debug: false,
  });

  const token = await Promise.race([
    client.getAccessToken(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("DingTalk token exchange timed out.")),
        probeTimeoutMs,
      ),
    ),
  ]);

  if (typeof token !== "string" || token.length === 0) {
    throw new Error("DingTalk did not return an access token.");
  }

  return "DingTalk token exchange succeeded.";
}

function resolveWeChatBaseUrl(config: Record<string, unknown>): string {
  const baseUrl = requiredText(config.baseUrl);
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("WeChat baseUrl must be a valid http:// or https:// URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("WeChat baseUrl must use http:// or https://.");
  }

  return parsed.toString().endsWith("/") ? parsed.toString() : `${parsed.toString()}/`;
}

function buildWeChatProbeHeaders(token: string, body: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    Authorization: `Bearer ${token}`,
    "Content-Length": String(Buffer.byteLength(body, "utf-8")),
  };
}

async function probeWeChat(config: Record<string, unknown>): Promise<string> {
  const token = requiredText(config.token);
  const baseUrl = resolveWeChatBaseUrl(config);
  const body = JSON.stringify({
    get_updates_buf: "",
    base_info: {
      channel_version: "relaydesk-probe",
    },
  });
  const response = await fetch(new URL("ilink/bot/getupdates", baseUrl), {
    method: "POST",
    headers: buildWeChatProbeHeaders(token, body),
    body,
    signal: AbortSignal.timeout(probeTimeoutMs),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(raw || `HTTP ${response.status}`);
  }
  return raw.trim()
    ? "WeChat ilink/getupdates probe succeeded."
    : "WeChat ilink/getupdates probe succeeded with an empty response.";
}

export async function probeChannelConfig(
  channel: string,
  config: Record<string, unknown>,
): Promise<string> {
  const issues = expectKeys(channel, config);
  if (issues.length > 0) throw new Error(issues.join(" "));

  switch (channel) {
    case "telegram":
      return probeTelegram(config);
    case "feishu":
      return probeFeishu(config);
    case "qq":
      return probeQQ(config);
    case "wework":
      return probeWeCom(config);
    case "dingtalk":
      return probeDingTalk(config);
    case "wechat":
      return probeWeChat(config);
    default:
      throw new Error(`Unknown channel: ${channel}`);
  }
}
