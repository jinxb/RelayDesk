import {
  Badge,
  Box,
  Card,
  Flex,
  Grid,
	Select,
	Text,
	TextArea,
	TextField,
} from "@radix-ui/themes";
import type { AgentKey, ChannelHealth, ChannelKey, FileConfigModel } from "../../lib/models";
import {
  buildChannelState,
  buildProbeResultText,
  channelHint,
  channelLabel,
  channelTone,
} from "../channel-probe-state";
import { agentChoices, channelDefinitions, inheritDefaultAgent } from "../catalog";
import type { RelayDeskStudio } from "../types";
import { formatAllowList, parseAllowList } from "../workspace";

export { channelHint, channelLabel, channelTone } from "../channel-probe-state";

export type EditablePlatform = NonNullable<NonNullable<FileConfigModel["platforms"]>[ChannelKey]>;
const PRIMARY_FIELD_COUNT = 2;

interface ChannelMutations {
  readonly onUpdatePlatform: (
    channel: ChannelKey,
    recipe: (platform: EditablePlatform) => void,
  ) => void;
  readonly onSetField: (channel: ChannelKey, field: string, value: string) => void;
}

interface ChannelListPanelProps {
  readonly studio: RelayDeskStudio;
  readonly selectedChannel: ChannelKey;
  readonly onSelect: (channel: ChannelKey) => void;
}

interface ChannelFormPanelProps extends ChannelMutations {
  readonly studio: RelayDeskStudio;
  readonly channel: (typeof channelDefinitions)[number];
  readonly workspaceState: EditablePlatform | undefined;
  readonly health: ChannelHealth | undefined;
}

function currentState(props: {
  readonly studio: RelayDeskStudio;
  readonly channelKey: ChannelKey;
  readonly workspaceState: EditablePlatform | undefined;
  readonly health: ChannelHealth | undefined;
}) {
  return buildChannelState({
    enabled: Boolean(props.workspaceState?.enabled),
    configured: props.health?.configured,
    healthMessage: props.health?.message,
    probe: props.studio.snapshot.probeResults[props.channelKey],
  });
}

export function buildProbeMessage(props: ChannelFormPanelProps) {
  return buildProbeResultText(props.studio.snapshot.probeResults[props.channel.key])
    ?? props.health?.message
    ?? (props.workspaceState?.enabled ? "还没有最近探测结果。" : "渠道未启用。");
}

export function routeLabel(aiCommand: AgentKey | undefined) {
  return aiCommand ? `使用 ${aiCommand}` : "跟随默认";
}

function routeValue(aiCommand: AgentKey | undefined) {
  return aiCommand ?? inheritDefaultAgent;
}

function primaryFields(channel: (typeof channelDefinitions)[number]) {
  const fields = channel.credentials.filter((field) => field.placement !== "advanced");
  return fields.length > 0 ? fields : channel.credentials.slice(0, PRIMARY_FIELD_COUNT);
}

function extraFields(channel: (typeof channelDefinitions)[number]) {
  return channel.credentials.filter((field) => field.placement === "advanced");
}

export function buildChannelListSummary(options: {
  readonly enabledCount: number;
  readonly healthyCount: number;
  readonly health: Partial<Record<ChannelKey, ChannelHealth>> | undefined;
}) {
  if (options.enabledCount === 0) {
    return "当前没有启用任何渠道。";
  }

  return `${options.enabledCount} 已启用 / ${options.healthyCount} 已完成基础配置`;
}

export function ChannelListPanel(props: ChannelListPanelProps) {
  const bootstrap = props.studio.snapshot.bootstrap;

  return (
    <Card className="relaydesk-surface relaydesk-channelListPanel" size="2">
      <Flex direction="column" gap="3">
        <Flex direction="column" gap="1">
          <Text size="2" color="gray">渠道列表</Text>
          <Text size="1" color="gray">
            {buildChannelListSummary({
              enabledCount: props.studio.snapshot.enabledCount,
              healthyCount: props.studio.snapshot.healthyCount,
              health: bootstrap?.health,
            })}
          </Text>
        </Flex>
        {channelDefinitions.map((item) => {
          const itemState = props.studio.snapshot.workspace.platforms?.[item.key];
          const itemHealth = bootstrap?.health[item.key];
          const active = item.key === props.selectedChannel;
          const state = currentState({
            studio: props.studio,
            channelKey: item.key,
            workspaceState: itemState as EditablePlatform | undefined,
            health: itemHealth,
          });

          return (
            <button
              key={item.key}
              type="button"
              className="relaydesk-channelRow"
              data-active={active}
              aria-pressed={active}
              onClick={() => props.onSelect(item.key)}
            >
              <Flex justify="between" align="center" gap="2">
                <div className="relaydesk-channelMeta">
                  <Text weight="medium">{item.title}</Text>
                  <Text size="1" color="gray">{item.mode}</Text>
                </div>
                <Flex align="center" gap="2">
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: `var(--${state.tone}-9)`,
                    }}
                  />
                  <Text size="1" color="gray" weight="medium">
                    {state.label}
                  </Text>
                </Flex>
              </Flex>
            </button>
          );
        })}
      </Flex>
    </Card>
  );
}

export function ChannelPrimaryFields(props: ChannelFormPanelProps) {
  const fields = primaryFields(props.channel);
  return (
    <Grid columns={{ initial: "1", md: "2" }} gap="4" className="relaydesk-channelFieldGrid">
      {fields.map((field) => (
        <Box key={field.key} className="relaydesk-fieldBlock">
          <Text as="label" size="2" color="gray">{field.label}</Text>
          <TextField.Root
            type={field.secret ? "password" : "text"}
            placeholder={field.placeholder}
            value={String((props.workspaceState as Record<string, unknown> | undefined)?.[field.key] ?? "")}
            onChange={(event) => {
              props.onSetField(props.channel.key, field.key, event.target.value);
            }}
          />
        </Box>
      ))}
    </Grid>
  );
}

export function ChannelAdvancedPanel(props: ChannelFormPanelProps) {
  const fields = extraFields(props.channel);

  return (
    <details className="relaydesk-disclosure relaydesk-channelDisclosure">
      <summary>高级设置</summary>
      <Grid columns={{ initial: "1", md: "2" }} gap="4" mt="4">
        <Box className="relaydesk-fieldBlock">
          <Text as="label" size="2" weight="medium" color="gray">
            独立 AI 路由
          </Text>
          <Select.Root
            value={routeValue(props.workspaceState?.aiCommand)}
            onValueChange={(value) => {
              props.onUpdatePlatform(props.channel.key, (platform) => {
                platform.aiCommand =
                  value === inheritDefaultAgent ? undefined : (value as AgentKey);
              });
            }}
          >
            <Select.Trigger />
            <Select.Content>
              <Select.Item value={inheritDefaultAgent}>跟随默认引擎</Select.Item>
              {agentChoices.map((agent) => (
                <Select.Item key={agent} value={agent}>使用 {agent}</Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Box>

        <Box className="relaydesk-fieldBlock">
          <Text as="label" size="2" weight="medium" color="gray">
            白名单用户 ID
          </Text>
          <TextArea
            resize="vertical"
            placeholder="留空表示不限制。支持逗号分隔。"
            value={formatAllowList(props.workspaceState?.allowedUserIds)}
            onChange={(event) => {
              props.onUpdatePlatform(props.channel.key, (platform) => {
                platform.allowedUserIds = parseAllowList(event.target.value);
              });
            }}
          />
        </Box>

        {fields.map((field) => (
          <Box key={field.key} className="relaydesk-fieldBlock">
            <Text as="label" size="2" weight="medium" color="gray">
              {field.label}
            </Text>
            <TextField.Root
              type={field.secret ? "password" : "text"}
              placeholder={field.placeholder}
              value={String((props.workspaceState as Record<string, unknown> | undefined)?.[field.key] ?? "")}
              onChange={(event) => {
                props.onSetField(props.channel.key, field.key, event.target.value);
              }}
            />
          </Box>
        ))}
      </Grid>
    </details>
  );
}
