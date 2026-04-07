import { getAIToolDisplayName, RELAYDESK_BRAND_SUFFIX } from "./utils.js";

export type SharedMessageStatus = "thinking" | "streaming" | "done" | "error";
export const RELAYDESK_SYSTEM_TITLE = "RelayDesk";

const DEFAULT_STATUS_TITLES: Record<SharedMessageStatus, string> = {
  thinking: "\u601d\u8003\u4e2d",
  streaming: "\u6267\u884c\u4e2d",
  done: "\u5b8c\u6210",
  error: "\u9519\u8bef",
};

interface BuildMessageTitleOptions {
  brandSuffix?: boolean;
  statusTitles?: Partial<Record<SharedMessageStatus, string>>;
}

export function buildMessageTitle(
  toolId: string,
  status: SharedMessageStatus,
  options: BuildMessageTitleOptions = {},
): string {
  const toolName = getAIToolDisplayName(toolId);
  const statusTitle = options.statusTitles?.[status] ?? DEFAULT_STATUS_TITLES[status];
  const title = `${toolName} - ${statusTitle}`;
  return options.brandSuffix ? `${title}${RELAYDESK_BRAND_SUFFIX}` : title;
}

export function buildCompletionSummary(toolId: string, note?: string): string {
  const toolName = getAIToolDisplayName(toolId);
  const cleanNote = note?.trim();
  return cleanNote ? `${toolName} · ${cleanNote}` : toolName;
}
