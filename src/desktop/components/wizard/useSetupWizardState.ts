import { useEffect, useMemo, useState } from "react";
import { relaydeskApi } from "../../../lib/client";
import { parseClaudeEnvRecord } from "../../claude-env";
import type { ChannelKey, FileConfigModel, ValidationResult } from "../../../lib/models";
import type { RelayDeskStudio } from "../../types";
import { resolvePreferredWorkdir } from "../../workspace";
import { wizardSteps } from "./wizard-model";
import { isWizardChannelConfigured } from "./wizard-probe-state";

function buildValidationError(error: unknown): ValidationResult {
  return {
    ok: false,
    issues: [error instanceof Error ? error.message : String(error)],
    requiredChannels: [],
    requiredAgents: [],
  };
}

function selectedPlatform(workspace: FileConfigModel, selectedChannel: ChannelKey) {
  return workspace.platforms?.[selectedChannel];
}

function isAgentReady(studio: RelayDeskStudio) {
  const diagnostics = studio.snapshot.bootstrap?.diagnostics;
  const selectedAgent = studio.snapshot.workspace.aiCommand ?? "claude";
  if (!diagnostics) {
    return false;
  }

  if (selectedAgent === "claude") {
    const parsed = parseClaudeEnvRecord(studio.snapshot.claudeEnvEditor);
    return Boolean(
      diagnostics.claudeReady
      || parsed.ANTHROPIC_API_KEY
      || parsed.ANTHROPIC_AUTH_TOKEN
      || parsed.CLAUDE_CODE_OAUTH_TOKEN
      || parsed.ANTHROPIC_BASE_URL,
    );
  }

  if (selectedAgent === "codex") {
    return diagnostics.codexReady;
  }

  return diagnostics.codebuddyReady;
}

function chooseInitialChannel(studio: RelayDeskStudio) {
  const enabled = Object.entries(studio.snapshot.workspace.platforms ?? {}).find((entry) => entry[1]?.enabled);
  return (enabled?.[0] as ChannelKey | undefined) ?? "telegram";
}

function currentWorkdir(studio: RelayDeskStudio) {
  return resolvePreferredWorkdir(studio.snapshot.workspace);
}

export function useSetupWizardState(studio: RelayDeskStudio) {
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedChannel, setSelectedChannel] = useState<ChannelKey>(() => chooseInitialChannel(studio));
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);

  const selectedAgent = studio.snapshot.workspace.aiCommand ?? "claude";
  const effectiveAgent = studio.snapshot.workspace.platforms?.[selectedChannel]?.aiCommand ?? selectedAgent;
  const routeOverridden = Boolean(studio.snapshot.workspace.platforms?.[selectedChannel]?.aiCommand);
  const workdir = currentWorkdir(studio);
  const channelConfigured = useMemo(
    () => isWizardChannelConfigured(
      selectedChannel,
      selectedPlatform(studio.snapshot.workspace, selectedChannel),
    ),
    [selectedChannel, studio.snapshot.workspace],
  );
  const agentReady = useMemo(
    () => isAgentReady(studio),
    [studio.snapshot.bootstrap, studio.snapshot.workspace.aiCommand, studio.snapshot.claudeEnvEditor],
  );

  async function runValidation() {
    setValidating(true);
    try {
      await studio.actions.validateWorkspace();
      const next = await relaydeskApi.validateWorkspace(
        studio.snapshot.workspace,
        parseClaudeEnvRecord(studio.snapshot.claudeEnvEditor),
      );
      setValidation(next);
    } catch (error) {
      setValidation(buildValidationError(error));
    } finally {
      setValidating(false);
    }
  }

  useEffect(() => {
    if (stepIndex !== wizardSteps.length - 1) {
      return;
    }

    void runValidation();
  }, [stepIndex, studio.snapshot.workspace, studio.snapshot.claudeEnvEditor]);

  function chooseChannel(channel: ChannelKey) {
    setSelectedChannel(channel);
    studio.actions.updateWorkspace((draft) => {
      if (!draft.platforms) {
        return;
      }

      for (const key of Object.keys(draft.platforms) as ChannelKey[]) {
        const item = draft.platforms[key];
        if (!item) continue;
        item.enabled = key === channel;
      }
    });
  }

  function canContinue() {
    if (stepIndex === 0) return Boolean(selectedChannel);
    if (stepIndex === 1) return channelConfigured;
    if (stepIndex === 2) return Boolean(selectedAgent);
    if (stepIndex === 3) return Boolean(workdir.trim());
    return Boolean(validation?.ok);
  }

  async function moveForward() {
    if (stepIndex < wizardSteps.length - 1) {
      setStepIndex((current) => current + 1);
      return;
    }

    await studio.actions.startRuntime();
  }

  async function saveOnly() {
    await studio.actions.saveWorkspace();
  }

  return {
    stepIndex,
    setStepIndex,
    selectedChannel,
    selectedAgent,
    effectiveAgent,
    routeOverridden,
    validation,
    validating,
    workdir,
    chooseChannel,
    canContinue,
    moveForward,
    runValidation,
    saveOnly,
  };
}
