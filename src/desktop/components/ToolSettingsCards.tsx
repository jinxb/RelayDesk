import {
  Badge,
  Box,
  Button,
  Flex,
  Grid,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { Settings2, Zap } from "lucide-react";
import { useState } from "react";
import { commonClaudeEnvKeys, parseClaudeEnvRecord, updateClaudeEnvRecord } from "../claude-env";
import type { RelayDeskStudio } from "../types";
import { ConfigDialog } from "./ConfigDialog";
import type { AgentKey } from "../../lib/models";

type ToolKey = "claude" | "codex" | "codebuddy";
const DEFAULT_TOOL_TIMEOUT_MS = 600000;
const DEFAULT_CODEX_TIMEOUT_MS = 1800000;
const DEFAULT_IDLE_TIMEOUT_MS = 600000;

interface ToolSettingsCardsProps {
  readonly studio: RelayDeskStudio;
}

function routeStats(studio: RelayDeskStudio) {
  const platforms = Object.values(studio.snapshot.workspace.platforms ?? {});
  const enabled = platforms.filter((platform) => platform?.enabled);
  const overridden = enabled.filter((platform) => Boolean(platform?.aiCommand)).length;
  return {
    enabledCount: enabled.length,
    inheritedCount: Math.max(enabled.length - overridden, 0),
    overriddenCount: overridden,
  };
}

function updateToolField(studio: RelayDeskStudio, tool: ToolKey, field: string, value: string | number) {
  studio.actions.updateWorkspace((draft) => {
    const target = draft.tools?.[tool] as Record<string, unknown> | undefined;
    if (target) target[field] = value;
  });
}

function parseTimeoutInput(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : fallback;
}

/* ── Tool summary card (grid item) ── */

interface ToolInfo {
  readonly key: ToolKey;
  readonly title: string;
  readonly summary: string;
  readonly ready: boolean;
}

function ToolSummaryCard({
  studio,
  tool,
  isDefault,
  onConfigure,
}: {
  studio: RelayDeskStudio;
  tool: ToolInfo;
  isDefault: boolean;
  onConfigure: () => void;
}) {
  return (
    <section className="relaydesk-dashCard relaydesk-toolSummaryCard relaydesk-toolCard" data-default={isDefault}>
      <Flex justify="between" align="center" gap="2">
        <Flex align="center" gap="2">
          <Settings2 size={16} color={tool.ready ? "var(--teal-10)" : "var(--gray-10)"} />
          <Text size="3" weight="bold">{tool.title}</Text>
        </Flex>
        <Flex gap="2" align="center">
          {isDefault ? (
            <Badge size="1" color="green" radius="full">当前默认</Badge>
          ) : null}
          <Badge size="1" color={tool.ready ? "green" : "gray"} radius="full">
            {tool.ready ? "就绪" : "未就绪"}
          </Badge>
        </Flex>
      </Flex>
      <div className="relaydesk-toolSummaryBody">
        <Text size="2" color="gray">{tool.summary}</Text>
      </div>
      <Flex justify="between" align="center" gap="2" className="relaydesk-toolSummaryFooter">
        {isDefault ? (
          <span className="relaydesk-toolSummaryMeta">未单独指定的渠道将走这里</span>
        ) : (
          <Button
            variant="soft"
            color="gray"
            size="1"
            onClick={() => {
              studio.actions.updateWorkspace((draft) => {
                draft.aiCommand = tool.key as AgentKey;
              });
            }}
          >
            设为默认
          </Button>
        )}
        <Button variant="soft" color={tool.ready ? "gray" : "teal"} size="1" onClick={onConfigure}>配置</Button>
      </Flex>
    </section>
  );
}

/* ── Dir field with browse ── */

function DirField({
  label,
  value,
  onChange,
  onBrowse,
  browsable,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBrowse?: () => void;
  browsable?: boolean;
}) {
  return (
    <Box className="relaydesk-fieldBlock" style={{ maxWidth: "100%" }}>
      <Text as="label" size="2" weight="medium">{label}</Text>
      <Flex gap="2" align="center">
        <TextField.Root style={{ flex: 1 }} value={value} onChange={(e) => onChange(e.target.value)} />
        {browsable && onBrowse ? (
          <Button variant="soft" size="1" onClick={onBrowse}>选择</Button>
        ) : null}
      </Flex>
    </Box>
  );
}

/* ── Inline text field ── */

function Field({ label, value, onChange, type }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "password" | "number";
}) {
  return (
    <Box className="relaydesk-fieldBlock" style={{ maxWidth: "100%" }}>
      <Text as="label" size="2" weight="medium">{label}</Text>
      <TextField.Root type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </Box>
  );
}

/* ── Claude config dialog ── */

function ClaudeConfigDialog({
  studio,
  open,
  onOpenChange,
}: {
  studio: RelayDeskStudio;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const claude = studio.snapshot.workspace.tools?.claude;
  const env = parseClaudeEnvRecord(studio.snapshot.claudeEnvEditor);
  const nativeEnabled = studio.snapshot.desktopSupported;

  function updateEnvField(key: string, value: string) {
    studio.actions.setClaudeEnvEditor(updateClaudeEnvRecord(studio.snapshot.claudeEnvEditor, key, value));
  }

  return (
    <ConfigDialog open={open} onOpenChange={onOpenChange} title="Claude 配置">
      <Flex direction="column" gap="4">
        <Grid columns="2" gap="4">
          <Field label="CLI 路径" value={claude?.cliPath ?? ""} onChange={(v) => updateToolField(studio, "claude", "cliPath", v)} />
          <DirField
            label="工作区目录"
            value={claude?.workDir ?? ""}
            onChange={(v) => updateToolField(studio, "claude", "workDir", v)}
            onBrowse={() => void studio.actions.pickDefaultWorkTree()}
            browsable={nativeEnabled}
          />
          <Field
            label="总超时 (ms)"
            type="number"
            value={String(claude?.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS)}
            onChange={(v) => updateToolField(studio, "claude", "timeoutMs", parseTimeoutInput(v, DEFAULT_TOOL_TIMEOUT_MS))}
          />
          <Field label="代理地址" value={claude?.proxy ?? ""} onChange={(v) => updateToolField(studio, "claude", "proxy", v)} />
        </Grid>

        <details className="relaydesk-inlineDisclosure">
          <summary>环境变量</summary>
          <Grid columns="2" gap="4" mt="2">
            {commonClaudeEnvKeys.map((field) => (
              <Field key={field.key} label={field.label} type={field.secret ? "password" : "text"} value={env[field.key] ?? ""} onChange={(v) => updateEnvField(field.key, v)} />
            ))}
          </Grid>
        </details>

        <details className="relaydesk-inlineDisclosure">
          <summary>高级 JSON 编辑</summary>
          <Box mt="2">
            <TextArea resize="vertical" rows={4} value={studio.snapshot.claudeEnvEditor} onChange={(e) => studio.actions.setClaudeEnvEditor(e.target.value)} />
          </Box>
        </details>
      </Flex>
    </ConfigDialog>
  );
}

/* ── Codex config dialog ── */

function CodexConfigDialog({
  studio,
  open,
  onOpenChange,
}: {
  studio: RelayDeskStudio;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const codex = studio.snapshot.workspace.tools?.codex;

  return (
    <ConfigDialog open={open} onOpenChange={onOpenChange} title="Codex 配置">
      <Flex direction="column" gap="3">
        <Text size="1" color="gray">总超时限制整次任务时长；空闲超时用于检测持续无输出。</Text>
        <Grid columns="2" gap="4">
          <Field label="CLI 路径" value={codex?.cliPath ?? "codex"} onChange={(v) => updateToolField(studio, "codex", "cliPath", v)} />
          <DirField
            label="工作区目录"
            value={codex?.workDir ?? ""}
            onChange={(v) => updateToolField(studio, "codex", "workDir", v)}
            onBrowse={() => void studio.actions.pickDefaultWorkTree()}
            browsable={studio.snapshot.desktopSupported}
          />
          <Field
            label="总超时 (ms)"
            type="number"
            value={String(codex?.timeoutMs ?? DEFAULT_CODEX_TIMEOUT_MS)}
            onChange={(v) => updateToolField(studio, "codex", "timeoutMs", parseTimeoutInput(v, DEFAULT_CODEX_TIMEOUT_MS))}
          />
          <Field
            label="空闲超时 (ms)"
            type="number"
            value={String(codex?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS)}
            onChange={(v) => updateToolField(studio, "codex", "idleTimeoutMs", parseTimeoutInput(v, DEFAULT_IDLE_TIMEOUT_MS))}
          />
          <Field label="代理地址" value={codex?.proxy ?? ""} onChange={(v) => updateToolField(studio, "codex", "proxy", v)} />
        </Grid>
      </Flex>
    </ConfigDialog>
  );
}

/* ── CodeBuddy config dialog ── */

function CodeBuddyConfigDialog({
  studio,
  open,
  onOpenChange,
}: {
  studio: RelayDeskStudio;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const codebuddy = studio.snapshot.workspace.tools?.codebuddy;

  return (
    <ConfigDialog open={open} onOpenChange={onOpenChange} title="CodeBuddy 配置">
      <Flex direction="column" gap="3">
        <Text size="1" color="gray">总超时限制整次任务时长；空闲超时用于检测持续无输出。</Text>
        <Grid columns="2" gap="4">
          <Field label="CLI 路径" value={codebuddy?.cliPath ?? "codebuddy"} onChange={(v) => updateToolField(studio, "codebuddy", "cliPath", v)} />
          <Field
            label="总超时 (ms)"
            type="number"
            value={String(codebuddy?.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS)}
            onChange={(v) => updateToolField(studio, "codebuddy", "timeoutMs", parseTimeoutInput(v, DEFAULT_TOOL_TIMEOUT_MS))}
          />
          <Field
            label="空闲超时 (ms)"
            type="number"
            value={String(codebuddy?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS)}
            onChange={(v) => updateToolField(studio, "codebuddy", "idleTimeoutMs", parseTimeoutInput(v, DEFAULT_IDLE_TIMEOUT_MS))}
          />
        </Grid>
      </Flex>
    </ConfigDialog>
  );
}

/* ── Export ── */

export function ToolSettingsCards({ studio }: ToolSettingsCardsProps) {
  const [activeDialog, setActiveDialog] = useState<ToolKey | null>(null);
  const selected = (studio.snapshot.workspace.aiCommand ?? "claude") as ToolKey;
  const stats = routeStats(studio);
  const diagnostics = studio.snapshot.bootstrap?.diagnostics;
  const codexSummary = !diagnostics?.codexReady
    ? (diagnostics?.codexIssue ?? "终端执行与代码修改")
    : diagnostics.codexLongPromptReady === false
      ? (diagnostics.codexIssue ?? "基础请求可用，长输入需要升级 CLI")
      : "终端执行与代码修改";

  const tools: ToolInfo[] = [
    { key: "claude", title: "Claude", summary: "通用协作与长上下文", ready: Boolean(diagnostics?.claudeReady) },
    { key: "codex", title: "Codex", summary: codexSummary, ready: Boolean(diagnostics?.codexReady) },
    { key: "codebuddy", title: "CodeBuddy", summary: "低频备用与补位", ready: Boolean(diagnostics?.codebuddyReady) },
  ];

  return (
    <>
      <Flex justify="between" align="center" gap="3" wrap="wrap" className="relaydesk-sectionLabel">
        <Flex align="center" gap="2">
          <Zap size={16} color="var(--gray-11)" />
          <Text size="2" weight="medium" color="gray">AI 工具</Text>
        </Flex>
        <Text size="1" color="gray" className="relaydesk-toolLaneHint">
          {stats.enabledCount > 0
            ? `${stats.inheritedCount} 个渠道跟随默认，${stats.overriddenCount} 个独立指定。`
            : "当前还没有启用渠道。"}
        </Text>
      </Flex>

      <Grid columns={{ initial: "1", sm: "3" }} gap="3">
        {tools.map((tool) => (
          <ToolSummaryCard
            key={tool.key}
            studio={studio}
            tool={tool}
            isDefault={selected === tool.key}
            onConfigure={() => setActiveDialog(tool.key)}
          />
        ))}
      </Grid>

      <ClaudeConfigDialog studio={studio} open={activeDialog === "claude"} onOpenChange={(open) => { if (!open) setActiveDialog(null); }} />
      <CodexConfigDialog studio={studio} open={activeDialog === "codex"} onOpenChange={(open) => { if (!open) setActiveDialog(null); }} />
      <CodeBuddyConfigDialog studio={studio} open={activeDialog === "codebuddy"} onOpenChange={(open) => { if (!open) setActiveDialog(null); }} />
    </>
  );
}
