import { Badge, Box, Button, Flex, Grid, Select, Switch, Text, TextField } from "@radix-ui/themes";
import type { RelayDeskStudio } from "../types";

interface RuntimeControlViewProps {
  readonly studio: RelayDeskStudio;
}

interface RuntimeStatusSummary {
  readonly sidecarLabel: string;
  readonly effectiveLogDir: string;
  readonly keepAwakeEnabled: boolean;
  readonly keepAwakeSupported: boolean;
  readonly keepAwakeSwitchDisabled: boolean;
  readonly nativeEnabled: boolean;
}

function buildRuntimeStatusSummary(studio: RelayDeskStudio): RuntimeStatusSummary {
  const diagnostics = studio.snapshot.bootstrap?.diagnostics;
  const nativeEnabled = studio.snapshot.desktopSupported;
  const keepAwakeEnabled = Boolean(studio.snapshot.workspace.runtime?.keepAwake);
  const keepAwakeSupported = diagnostics?.platform.startsWith("darwin") ?? false;

  return {
    sidecarLabel: nativeEnabled
      ? studio.snapshot.sidecar?.running ? "就绪" : "已停止"
      : "浏览器",
    effectiveLogDir: diagnostics?.logDir ?? "不可用",
    keepAwakeEnabled,
    keepAwakeSupported,
    keepAwakeSwitchDisabled: studio.snapshot.busy || (!keepAwakeSupported && !keepAwakeEnabled),
    nativeEnabled,
  };
}

function BridgeSection({
  studio,
  summary,
}: {
  studio: RelayDeskStudio;
  summary: RuntimeStatusSummary;
}) {
  return (
    <section className="relaydesk-runtimePanel">
      <Flex justify="between" align="center" wrap="wrap" gap="3" className="relaydesk-runtimePanelHeader">
        <Text size="3" weight="bold">本地桥接</Text>
        <Badge color={studio.snapshot.sidecar?.running ? "green" : "gray"}>
          {summary.sidecarLabel}
        </Badge>
      </Flex>

      <Flex gap="2" wrap="wrap" className="relaydesk-runtimePanelActions">
        {summary.nativeEnabled ? (
          <>
            <Button
              variant="soft"
              size="1"
              onClick={() => void studio.actions.startSidecar()}
              disabled={studio.snapshot.busy || !summary.nativeEnabled}
            >
              启动桥接
            </Button>
            <Button
              variant="soft"
              size="1"
              color="gray"
              onClick={() => void studio.actions.stopSidecar()}
              disabled={studio.snapshot.busy || !summary.nativeEnabled}
            >
              停止桥接
            </Button>
          </>
        ) : null}
        <Button
          variant="soft"
          size="1"
          onClick={() => void studio.actions.validateWorkspace()}
          disabled={studio.snapshot.busy}
        >
          校验环境
        </Button>
      </Flex>
    </section>
  );
}

function KeepAwakeSection({
  studio,
  summary,
}: {
  studio: RelayDeskStudio;
  summary: RuntimeStatusSummary;
}) {
  const supportText = summary.keepAwakeSupported
    ? "下次启动后台服务后生效。"
    : "仅 macOS 支持。";

  return (
    <section className="relaydesk-runtimePanel">
      <Flex justify="between" align="start" gap="3" className="relaydesk-runtimePanelHeader">
        <Flex direction="column" gap="2">
          <Text size="3" weight="bold">常驻模式</Text>
          <Text size="2" color="gray">
            服务运行时阻止系统空闲睡眠。
          </Text>
          <Text size="1" color={summary.keepAwakeSupported ? "gray" : "orange"}>
            {supportText}
          </Text>
        </Flex>
        <Switch
          size="2"
          checked={summary.keepAwakeEnabled}
          disabled={summary.keepAwakeSwitchDisabled}
          onCheckedChange={(checked) => {
            studio.actions.updateWorkspace((draft) => {
              draft.runtime = {
                ...(draft.runtime ?? {}),
                keepAwake: checked,
              };
            });
          }}
        />
      </Flex>
    </section>
  );
}

function LogSection({
  studio,
  summary,
}: {
  studio: RelayDeskStudio;
  summary: RuntimeStatusSummary;
}) {
  return (
    <section className="relaydesk-runtimePanel">
      <Flex justify="between" align="center" gap="3" wrap="wrap" className="relaydesk-runtimePanelHeader">
        <Text size="3" weight="bold">日志</Text>
        <Button
          variant="soft"
          size="1"
          color="gray"
          onClick={() => void studio.actions.openPath(studio.snapshot.bootstrap?.diagnostics?.logDir ?? "")}
          disabled={studio.snapshot.busy || !summary.nativeEnabled || !studio.snapshot.bootstrap?.diagnostics?.logDir}
        >
          打开日志目录
        </Button>
      </Flex>

      <Text size="2" color="gray" className="relaydesk-runtimePathText">
        当前生效目录：{summary.effectiveLogDir}
      </Text>

      <Grid columns="2" gap="4">
        <Box className="relaydesk-fieldBlock" style={{ maxWidth: "100%" }}>
          <Text as="label" size="2" weight="medium">自定义日志目录</Text>
          <TextField.Root
            value={studio.snapshot.workspace.logDir ?? ""}
            placeholder={`留空则使用默认目录：${summary.effectiveLogDir}`}
            onChange={(e) => {
              studio.actions.updateWorkspace((draft) => {
                draft.logDir = e.target.value;
              });
            }}
          />
        </Box>
        <Box className="relaydesk-fieldBlock" style={{ maxWidth: "100%" }}>
          <Text as="label" size="2" weight="medium">日志级别</Text>
          <Select.Root
            value={studio.snapshot.workspace.logLevel ?? "INFO"}
            onValueChange={(value) => {
              studio.actions.updateWorkspace((draft) => {
                draft.logLevel = value;
              });
            }}
          >
            <Select.Trigger />
            <Select.Content>
              <Select.Item value="DEBUG">DEBUG</Select.Item>
              <Select.Item value="INFO">INFO</Select.Item>
              <Select.Item value="WARN">WARN</Select.Item>
              <Select.Item value="ERROR">ERROR</Select.Item>
            </Select.Content>
          </Select.Root>
        </Box>
      </Grid>
    </section>
  );
}

export function RuntimeControlView({ studio }: RuntimeControlViewProps) {
  const summary = buildRuntimeStatusSummary(studio);

  return (
    <Flex direction="column" gap="0" className="relaydesk-runtimeStack">
      <BridgeSection studio={studio} summary={summary} />
      <KeepAwakeSection studio={studio} summary={summary} />
      <LogSection studio={studio} summary={summary} />
    </Flex>
  );
}
