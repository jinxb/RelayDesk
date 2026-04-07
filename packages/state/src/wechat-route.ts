const LEGACY_WECHAT_KEYS = [
  "appId",
  "appSecret",
  "guid",
  "userId",
  "wsUrl",
  "jwtToken",
  "loginKey",
] as const;

export const WECHAT_ROUTE_REQUIRED_MESSAGE =
  "WeChat requires ilink/getupdates credentials: token and baseUrl.";

export const WECHAT_LEGACY_CONFIG_MESSAGE =
  "WeChat legacy AGP/OAuth fields are no longer supported. Configure token and baseUrl for the ilink/getupdates transport.";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function hasWeChatIlinkCredentials(config: {
  readonly token?: unknown;
  readonly baseUrl?: unknown;
} | undefined): boolean {
  return Boolean(text(config?.token) && text(config?.baseUrl));
}

export function hasLegacyWeChatConfig(
  config: Record<string, unknown> | undefined,
): boolean {
  return LEGACY_WECHAT_KEYS.some((key) => text(config?.[key]) !== "");
}

export function getWeChatConfigIssue(
  config: Record<string, unknown> | undefined,
): string {
  return hasLegacyWeChatConfig(config)
    ? WECHAT_LEGACY_CONFIG_MESSAGE
    : WECHAT_ROUTE_REQUIRED_MESSAGE;
}
