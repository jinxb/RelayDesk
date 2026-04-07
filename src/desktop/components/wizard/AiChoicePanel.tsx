import { Badge, Box, Card, Flex, Grid, Text, TextField } from "@radix-ui/themes";
import type { AgentKey } from "../../../lib/models";
import { commonClaudeEnvKeys, parseClaudeEnvRecord, updateClaudeEnvRecord } from "../../claude-env";
import type { RelayDeskStudio } from "../../types";

interface AiChoicePanelProps {
  readonly studio: RelayDeskStudio;
}

function updateClaudeEnv(studio: RelayDeskStudio, key: string, value: string) {
  studio.actions.setClaudeEnvEditor(updateClaudeEnvRecord(studio.snapshot.claudeEnvEditor, key, value));
}

function updateToolField(
  studio: RelayDeskStudio,
  tool: "claude" | "codex" | "codebuddy",
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

function agentSummary(agent: AgentKey) {
  if (agent === "claude") return "最适合第一次完成远程接入。";
  if (agent === "codex") return "适合已经完成本机登录和 CLI 配置的环境。";
  return "低频备用工具，适合特定工作流。";
}

function AgentCard({ studio, agent }: { studio: RelayDeskStudio; agent: AgentKey }) {
  const active = (studio.snapshot.workspace.aiCommand ?? "claude") === agent;
  const ready = agentReady(studio, agent);

  return (
    <Card
      className="relaydesk-surface"
      style={{
        cursor: "pointer",
        borderColor: active ? "rgba(20,163,139,0.38)" : "var(--line-subtle)",
        background: active ? "rgba(221,246,240,0.74)" : "rgba(255,255,255,0.86)",
      }}
      onClick={() => {
        studio.actions.updateWorkspace((draft) => {
          draft.aiCommand = agent;
        });
      }}
    >
      <Flex direction="column" gap="2">
        <Flex justify="between" align="center" gap="3">
          <Text size="3" weight="bold">{agent}</Text>
          <Badge color={ready ? "green" : "gray"}>{ready ? "就绪" : "需配置"}</Badge>
        </Flex>
        <Text size="2" color="gray">{agentSummary(agent)}</Text>
      </Flex>
    </Card>
  );
}

function ClaudeQuickSetup({ studio }: { studio: RelayDeskStudio }) {
  const claude = studio.snapshot.workspace.tools?.claude;
  const env = parseClaudeEnvRecord(studio.snapshot.claudeEnvEditor);

  return (
    <Grid columns={{ initial: "1", md: "2" }} gap="4">
      {commonClaudeEnvKeys.map((field) => (
        <Box key={field.key} className="relaydesk-fieldBlock">
          <Text as="label" size="2" weight="medium">{field.label}</Text>
          <TextField.Root
            type={field.secret ? "password" : "text"}
            value={env[field.key] ?? ""}
            onChange={(event) => updateClaudeEnv(studio, field.key, event.target.value)}
            placeholder={field.placeholder}
          />
        </Box>
      ))}
      <Box className="relaydesk-fieldBlock">
        <Text as="label" size="2" weight="medium">CLI 路径</Text>
        <TextField.Root
          value={claude?.cliPath ?? ""}
          onChange={(event) => updateToolField(studio, "claude", "cliPath", event.target.value)}
          placeholder="留空则使用默认 SDK 模式"
        />
      </Box>
      <Box className="relaydesk-fieldBlock">
        <Text as="label" size="2" weight="medium">代理地址（可选）</Text>
        <TextField.Root
          value={claude?.proxy ?? ""}
          onChange={(event) => updateToolField(studio, "claude", "proxy", event.target.value)}
          placeholder="http://127.0.0.1:7890"
        />
      </Box>
    </Grid>
  );
}

function CodexQuickSetup({ studio }: { studio: RelayDeskStudio }) {
  const codex = studio.snapshot.workspace.tools?.codex;

  return (
    <Grid columns={{ initial: "1", md: "2" }} gap="4">
      <Box className="relaydesk-fieldBlock">
        <Text as="label" size="2" weight="medium">CLI 路径</Text>
        <TextField.Root
          value={codex?.cliPath ?? "codex"}
          onChange={(event) => updateToolField(studio, "codex", "cliPath", event.target.value)}
        />
      </Box>
      <Box className="relaydesk-fieldBlock">
        <Text as="label" size="2" weight="medium">代理地址（可选）</Text>
        <TextField.Root
          value={codex?.proxy ?? ""}
          onChange={(event) => updateToolField(studio, "codex", "proxy", event.target.value)}
          placeholder="http://127.0.0.1:7890"
        />
      </Box>
      <Text size="2" color="gray">
        Codex 仍需要本机已有可用授权。这里只处理 CLI 路径与代理，不代替本地登录。
      </Text>
    </Grid>
  );
}

function CodeBuddyQuickSetup({ studio }: { studio: RelayDeskStudio }) {
  const codebuddy = studio.snapshot.workspace.tools?.codebuddy;

  return (
    <Grid columns={{ initial: "1", md: "2" }} gap="4">
      <Box className="relaydesk-fieldBlock">
        <Text as="label" size="2" weight="medium">CLI 路径</Text>
        <TextField.Root
          value={codebuddy?.cliPath ?? "codebuddy"}
          onChange={(event) => updateToolField(studio, "codebuddy", "cliPath", event.target.value)}
        />
      </Box>
      <Text size="2" color="gray">
        CodeBuddy 在首次接入里通常作为备用工具，只要本机可执行即可。
      </Text>
    </Grid>
  );
}

export function AiChoicePanel({ studio }: AiChoicePanelProps) {
  const selected = studio.snapshot.workspace.aiCommand ?? "claude";
  const selectedReady = agentReady(studio, selected);

  return (
    <Flex direction="column" gap="5">
      <Grid columns={{ initial: "1", md: "3" }} gap="4">
        <AgentCard studio={studio} agent="claude" />
        <AgentCard studio={studio} agent="codex" />
        <AgentCard studio={studio} agent="codebuddy" />
      </Grid>

      <Box className="relaydesk-surface" style={{ padding: 20 }}>
        <Flex direction="column" gap="3">
          <Flex justify="between" align="center" gap="3" wrap="wrap">
            <div>
              <Text size="3" weight="bold">{selected} 配置</Text>
              <Text size="2" color="gray">
                只展示首次接入必需的最少项，更多高级配置可在主界面里继续调整。
              </Text>
            </div>
            <Badge color={selectedReady ? "green" : "amber"}>
              {selectedReady ? "可以继续" : "还需补全"}
            </Badge>
          </Flex>

          {selected === "claude" ? <ClaudeQuickSetup studio={studio} /> : null}
          {selected === "codex" ? <CodexQuickSetup studio={studio} /> : null}
          {selected === "codebuddy" ? <CodeBuddyQuickSetup studio={studio} /> : null}
        </Flex>
      </Box>
    </Flex>
  );
}
