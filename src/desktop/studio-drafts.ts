import type { BootstrapPayload, ChannelKey, FileConfigModel } from "../lib/models";
import { normalizeBootstrapPayload } from "./studio-support";
import { parseWorkspaceSource, stringifyWorkspace } from "./workspace";

interface DraftStateOptions {
  readonly bootstrap: BootstrapPayload | null;
  readonly workspace: FileConfigModel;
  readonly claudeEnvEditor: string;
  readonly rawDraft: boolean;
}

interface SaveWorkspaceOptions {
  readonly workspace: FileConfigModel;
  readonly rawEditor: string;
  readonly rawDraft: boolean;
}

function normalizeText(input: string) {
  return input.trim();
}

export function channelDisplayName(channel: ChannelKey) {
  if (channel === "telegram") return "Telegram";
  if (channel === "feishu") return "飞书";
  if (channel === "qq") return "QQ";
  if (channel === "wechat") return "微信";
  if (channel === "wework") return "企业微信";
  return "钉钉";
}

export function buildDraftState(options: DraftStateOptions) {
  const currentWorkspace = stringifyWorkspace(options.workspace);

  if (!options.bootstrap) {
    return { dirty: false, rawDraft: options.rawDraft };
  }

  const baseline = normalizeBootstrapPayload(options.bootstrap);
  const workspaceDirty = currentWorkspace !== baseline.rawEditor;
  const envDirty = normalizeText(options.claudeEnvEditor) !== normalizeText(baseline.claudeEnvEditor);

  return {
    dirty: workspaceDirty || envDirty,
    rawDraft: options.rawDraft,
  };
}

export function resolveWorkspaceForSave(options: SaveWorkspaceOptions) {
  if (!options.rawDraft) {
    return options.workspace;
  }

  return parseWorkspaceSource(options.rawEditor);
}
