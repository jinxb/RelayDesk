import { Badge, Box, Flex, Grid, Text, TextField } from "@radix-ui/themes";
import type { AgentKey } from "../../../lib/models";
import { commonClaudeEnvKeys, parseClaudeEnvRecord, updateClaudeEnvRecord } from "../../claude-env";
import type { RelayDeskStudio } from "../../types";

interface AiChoicePanelProps {
  readonly studio: RelayDeskStudio;
}

interface AgentMeta {
  readonly key: AgentKey;
  readonly title: string;
  readonly summary: string;
  readonly pendingLabel: string;
}

const AGENTS: readonly AgentMeta[] = [
  {
    key: "claude",
    title: "Claude",
    summary: "适合第一次接入，直接填写凭据即可。",
    pendingLabel: "填写凭据",
  },
  {
    key: "codex",
    title: "Codex",
    summary: "适合本机已完成登录的 CLI 环境。",
    pendingLabel: "稍后复核",
  },
  {
    key: "codebuddy",
    title: "CodeBuddy",
    summary: "适合低频备用或特定工作流。",
    pendingLabel: "稍后复核",
  },
] as const;

function agentMeta(agent: AgentKey) {
  return AGENTS.find((item) => item.key === agent) ?? AGENTS[0];
}

function updateClaudeEnv(studio: RelayDeskStudio, key: string, value: string) {
  studio.actions.setClaudeEnvEditor(updateClaudeEnvRecord(studio.snapshot.claudeEnvEditor, key, value));
}

function updateToolField(
  studio: RelayDeskStudio,
  tool: AgentKey,
  field: string,
  value: string | number,
) {
  studio.actions.updateWorkspace((draft) => {
    const target = draft.tools?.[tool] as Record<string, unknown> | undefined;
    if (!target) {
      return;
    }

    target[field] = value;
  });
}

function agentReady(studio: RelayDeskStudio, agent: AgentKey) {
  const diagnostics = studio.snapshot.bootstrap?.diagnostics;
  if (!diagnostics) {
    return false;
  }

  if (agent === "claude") {
    const env = parseClaudeEnvRecord(studio.snapshot.claudeEnvEditor);
    return Boolean(
      diagnostics.claudeReady ||
      env.ANTHROPIC_API_KEY ||
      env.ANTHROPIC_AUTH_TOKEN ||
      env.CLAUDE_CODE_OAUTH_TOKEN ||
      env.ANTHROPIC_BASE_URL,
    );
  }

  if (agent === "codex") {
    return diagnostics.codexReady;
  }

  return diagnostics.codebuddyReady;
}

function AgentOption({ studio, agent }: { studio: RelayDeskStudio; agent: AgentMeta }) {
  const active = (studio.snapshot.workspace.aiCommand ?? "claude") === agent.key;
  const ready = agentReady(studio, agent.key);

  return (
    <button
      type="button"
      className="relaydesk-wizardAgentOption"
      data-active={active}
      data-ready={ready}
      onClick={() => {
        studio.actions.updateWorkspace((draft) => {
          draft.aiCommand = agent.key;
        });
      }}
    >
      <div className="relaydesk-wizardAgentOptionMain">
        <div className="relaydesk-wizardAgentOptionTopline">
          <Text size="4" weight="bold">{agent.title}</Text>
          {active ? <span className="relaydesk-wizardAgentCurrent">当前选择</span> : null}
        </div>
        <Badge color={ready ? "green" : "gray"} radius="full">
          {ready ? "已就绪" : agent.pendingLabel}
        </Badge>
      </div>
      <Text size="2" color="gray" className="relaydesk-wizardAgentOptionCopy">
        {agent.summary}
      </Text>
    </button>
  );
}

function ClaudeQuickSetup({ studio }: { studio: RelayDeskStudio }) {
  const claude = studio.snapshot.workspace.tools?.claude;
  const env = parseClaudeEnvRecord(studio.snapshot.claudeEnvEditor);

  return (
    <Flex direction="column" gap="3">
      <Box className="relaydesk-fieldBlock relaydesk-fieldBlock--wide">
        <Text as="label" size="2" weight="medium">API Key</Text>
        <TextField.Root
          type="password"
          value={env.ANTHROPIC_API_KEY ?? ""}
          onChange={(event) => updateClaudeEnv(studio, "ANTHROPIC_API_KEY", event.target.value)}
          placeholder="sk-ant-..."
        />
      </Box>

      <details className="relaydesk-wizardInlineDisclosure">
        <summary>其他接入方式</summary>
        <div className="relaydesk-wizardConfigFields relaydesk-wizardConfigFields--compact">
          <Box className="relaydesk-fieldBlock relaydesk-fieldBlock--wide">
            <Text as="label" size="2" weight="medium">Base URL</Text>
            <TextField.Root
              value={env.ANTHROPIC_BASE_URL ?? ""}
              onChange={(event) => updateClaudeEnv(studio, "ANTHROPIC_BASE_URL", event.target.value)}
              placeholder="可选"
            />
          </Box>
          {commonClaudeEnvKeys
            .filter((field) => field.key !== "ANTHROPIC_API_KEY" && field.key !== "ANTHROPIC_BASE_URL")
            .map((field) => (
              <Box key={field.key} className="relaydesk-fieldBlock relaydesk-fieldBlock--wide">
                <Text as="label" size="2" weight="medium">{field.label}</Text>
                <TextField.Root
                  type={field.secret ? "password" : "text"}
                  value={env[field.key] ?? ""}
                  onChange={(event) => updateClaudeEnv(studio, field.key, event.target.value)}
                  placeholder={field.placeholder}
                />
              </Box>
            ))}
          <Box className="relaydesk-fieldBlock relaydesk-fieldBlock--wide">
            <Text as="label" size="2" weight="medium">CLI 路径</Text>
            <TextField.Root
              value={claude?.cliPath ?? ""}
              onChange={(event) => updateToolField(studio, "claude", "cliPath", event.target.value)}
              placeholder="可选"
            />
          </Box>
          <Box className="relaydesk-fieldBlock relaydesk-fieldBlock--wide">
            <Text as="label" size="2" weight="medium">代理地址</Text>
            <TextField.Root
              value={claude?.proxy ?? ""}
              onChange={(event) => updateToolField(studio, "claude", "proxy", event.target.value)}
              placeholder="可选"
            />
          </Box>
        </div>
      </details>
    </Flex>
  );
}

function CodexQuickSetup({ studio }: { studio: RelayDeskStudio }) {
  const codex = studio.snapshot.workspace.tools?.codex;

  return (
    <Flex direction="column" gap="3">
      <Box className="relaydesk-fieldBlock relaydesk-fieldBlock--wide">
        <Text as="label" size="2" weight="medium">CLI 路径</Text>
        <TextField.Root
          value={codex?.cliPath ?? "codex"}
          onChange={(event) => updateToolField(studio, "codex", "cliPath", event.target.value)}
        />
      </Box>
      <details className="relaydesk-wizardInlineDisclosure">
        <summary>代理地址</summary>
        <div className="relaydesk-wizardConfigFields relaydesk-wizardConfigFields--compact">
          <Box className="relaydesk-fieldBlock relaydesk-fieldBlock--wide">
            <Text as="label" size="2" weight="medium">代理地址</Text>
            <TextField.Root
              value={codex?.proxy ?? ""}
              onChange={(event) => updateToolField(studio, "codex", "proxy", event.target.value)}
              placeholder="http://127.0.0.1:7890"
            />
          </Box>
        </div>
      </details>
    </Flex>
  );
}

function CodeBuddyQuickSetup({ studio }: { studio: RelayDeskStudio }) {
  const codebuddy = studio.snapshot.workspace.tools?.codebuddy;

  return (
    <div className="relaydesk-wizardConfigFields relaydesk-wizardConfigFields--compact">
      <Box className="relaydesk-fieldBlock relaydesk-fieldBlock--wide">
        <Text as="label" size="2" weight="medium">CLI 路径</Text>
        <TextField.Root
          value={codebuddy?.cliPath ?? "codebuddy"}
          onChange={(event) => updateToolField(studio, "codebuddy", "cliPath", event.target.value)}
        />
      </Box>
    </div>
  );
}

export function AiChoicePanel({ studio }: AiChoicePanelProps) {
  const selected = studio.snapshot.workspace.aiCommand ?? "claude";
  const selectedMeta = agentMeta(selected);
  const selectedReady = agentReady(studio, selected);

  return (
    <Flex direction="column" gap="3">
      <div className="relaydesk-wizardAgentList">
        {AGENTS.map((agent) => (
          <AgentOption key={agent.key} studio={studio} agent={agent} />
        ))}
      </div>

      <Box className="relaydesk-wizardConfigPanel">
        <Flex justify="between" align="center" gap="3" wrap="wrap">
          <div className="relaydesk-wizardConfigHeading">
            <Text size="3" weight="bold">{selectedMeta.title} 配置</Text>
            <Text size="2" color="gray">确认启动前会再校验一次。</Text>
          </div>
          <Badge color={selectedReady ? "green" : "amber"} radius="full">
            {selectedReady ? "已就绪" : "待复核"}
          </Badge>
        </Flex>

        {selected === "claude" ? <ClaudeQuickSetup studio={studio} /> : null}
        {selected === "codex" ? <CodexQuickSetup studio={studio} /> : null}
        {selected === "codebuddy" ? <CodeBuddyQuickSetup studio={studio} /> : null}
      </Box>
    </Flex>
  );
}
