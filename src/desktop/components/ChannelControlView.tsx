import {
  Badge,
  Button,
  Flex,
  Grid,
  Switch,
  Text,
} from "@radix-ui/themes";
import { useEffect, useState } from "react";
import { ConfigDialog } from "./ConfigDialog";
import { PageTopline } from "./PageTopline";
import type { ChannelKey } from "../../lib/models";
import { channelDefinitions } from "../catalog";
import {
  ChannelAdvancedPanel,
  ChannelPrimaryFields,
  channelLabel,
  channelTone,
  type EditablePlatform,
} from "./ChannelPanels";
import { resolveSelectedChannel } from "../channel-selection";
import type { RelayDeskStudio } from "../types";

interface ChannelControlViewProps {
  readonly studio: RelayDeskStudio;
}

function updatePlatform(studio: RelayDeskStudio, channel: ChannelKey, recipe: (p: EditablePlatform) => void) {
  studio.actions.updateWorkspace((draft) => {
    const platform = draft.platforms?.[channel] as EditablePlatform | undefined;
    if (platform) recipe(platform);
  });
}

function setPlatformField(studio: RelayDeskStudio, channel: ChannelKey, field: string, value: string) {
  updatePlatform(studio, channel, (p) => {
    (p as Record<string, unknown>)[field] = value;
  });
}

/* ── Channel Card (grid item) ── */

function ChannelCard({
  studio,
  channel,
  onConfigure,
}: {
  studio: RelayDeskStudio;
  channel: (typeof channelDefinitions)[number];
  onConfigure: () => void;
}) {
  const health = studio.snapshot.bootstrap?.health[channel.key];
  const enabled = Boolean(studio.snapshot.workspace.platforms?.[channel.key]?.enabled);
  const tone = channelTone(health, enabled, studio.snapshot.probeResults[channel.key]);
  const label = channelLabel(health, enabled, studio.snapshot.probeResults[channel.key]);

  return (
    <section className="relaydesk-dashCard relaydesk-channelCard">
      <Flex justify="between" align="center" gap="2">
        <Text size="3" weight="bold">{channel.title}</Text>
        <Badge size="1" variant="soft" color={tone}>{label}</Badge>
      </Flex>
      <Text size="1" color="gray">{channel.mode}</Text>
      <Flex align="center" gap="2" wrap="wrap">
        <Switch
          size="1"
          checked={enabled}
          onCheckedChange={(checked) => {
            updatePlatform(studio, channel.key, (p) => { p.enabled = checked; });
          }}
        />
        <Text size="1" color="gray">{enabled ? "已启用" : "未启用"}</Text>
        <div style={{ flex: 1 }} />
        <Button variant="soft" color="indigo" size="1" onClick={() => void studio.actions.probeChannel(channel.key)} disabled={studio.snapshot.busy || !enabled}>
          测试
        </Button>
        <Button variant="soft" color="gray" size="1" onClick={onConfigure}>配置</Button>
      </Flex>
    </section>
  );
}

/* ── Channel Config Dialog ── */

function ChannelConfigDialog({
  studio,
  channel,
  open,
  onOpenChange,
}: {
  studio: RelayDeskStudio;
  channel: (typeof channelDefinitions)[number];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const workspaceState = studio.snapshot.workspace.platforms?.[channel.key] as EditablePlatform | undefined;
  const health = studio.snapshot.bootstrap?.health[channel.key];

  const formProps = {
    studio,
    channel,
    workspaceState,
    health,
    onSetField: (ch: ChannelKey, field: string, value: string) => setPlatformField(studio, ch, field, value),
    onUpdatePlatform: (ch: ChannelKey, recipe: (p: EditablePlatform) => void) => updatePlatform(studio, ch, recipe),
  };

  return (
    <ConfigDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${channel.title} 配置`}
      description={channel.summary}
      className="relaydesk-channelDialog"
    >
      <Flex direction="column" gap="4">
        <ChannelPrimaryFields {...formProps} />
        <ChannelAdvancedPanel {...formProps} />
      </Flex>
    </ConfigDialog>
  );
}

/* ── Main View ── */

export function ChannelControlView({ studio }: ChannelControlViewProps) {
  const [selectedChannel, setSelectedChannel] = useState<ChannelKey>(() => {
    const enabled = channelDefinitions.find((c) => studio.snapshot.workspace.platforms?.[c.key]?.enabled);
    return enabled?.key ?? "telegram";
  });
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    setSelectedChannel((current) =>
      resolveSelectedChannel({
        current,
        dialogOpen,
        enabledByChannel: {
          telegram: studio.snapshot.workspace.platforms?.telegram?.enabled,
          feishu: studio.snapshot.workspace.platforms?.feishu?.enabled,
          qq: studio.snapshot.workspace.platforms?.qq?.enabled,
          wechat: studio.snapshot.workspace.platforms?.wechat?.enabled,
          wework: studio.snapshot.workspace.platforms?.wework?.enabled,
          dingtalk: studio.snapshot.workspace.platforms?.dingtalk?.enabled,
        },
        configuredByChannel: {
          telegram: studio.snapshot.bootstrap?.health.telegram?.configured,
          feishu: studio.snapshot.bootstrap?.health.feishu?.configured,
          qq: studio.snapshot.bootstrap?.health.qq?.configured,
          wechat: studio.snapshot.bootstrap?.health.wechat?.configured,
          wework: studio.snapshot.bootstrap?.health.wework?.configured,
          dingtalk: studio.snapshot.bootstrap?.health.dingtalk?.configured,
        },
      }),
    );
  }, [dialogOpen, studio.snapshot.bootstrap, studio.snapshot.workspace.platforms]);

  const channel = channelDefinitions.find((c) => c.key === selectedChannel) ?? channelDefinitions[0];

  return (
    <Flex direction="column" className="relaydesk-pageSection">
      <PageTopline title="连接" summary="选择聊天平台并配置接入信息" />

      <Grid columns={{ initial: "1", sm: "2", md: "3" }} gap="3" className="relaydesk-channelGrid">
        {channelDefinitions.map((item) => (
          <ChannelCard
            key={item.key}
            studio={studio}
            channel={item}
            onConfigure={() => {
              setSelectedChannel(item.key);
              setDialogOpen(true);
            }}
          />
        ))}
      </Grid>

      <ChannelConfigDialog
        studio={studio}
        channel={channel}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </Flex>
  );
}
