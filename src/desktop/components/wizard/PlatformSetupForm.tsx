import { Badge, Box, Button, Flex, Text, TextField } from "@radix-ui/themes";
import { channelDefinitions } from "../../catalog";
import type { ChannelKey } from "../../../lib/models";
import type { RelayDeskStudio } from "../../types";
import type { EditablePlatform } from "../ChannelPanels";
import { resolveWizardProbeState } from "./wizard-probe-state";

interface PlatformSetupFormProps {
  readonly channelKey: ChannelKey;
  readonly studio: RelayDeskStudio;
  readonly onTest: () => Promise<void>;
}

export function PlatformSetupForm({ channelKey, studio, onTest }: PlatformSetupFormProps) {
  const def = channelDefinitions.find((d) => d.key === channelKey);
  if (!def) return null;

  const currentConfig = studio.snapshot.workspace.platforms?.[channelKey] as EditablePlatform | undefined;

  function handleUpdate(field: string, value: string) {
    studio.actions.updateWorkspace((draft) => {
      if (!draft.platforms) draft.platforms = {};
      const channelData = draft.platforms[channelKey] as Record<string, unknown> | undefined;
      draft.platforms[channelKey] = {
        ...channelData,
        [field]: value,
        enabled: true,
      } as EditablePlatform;
    });
  }

  const result = studio.snapshot.probeResults[channelKey];
  const probeState = resolveWizardProbeState({
    channelKey,
    config: currentConfig,
    probe: result,
  });

  return (
    <Flex direction="column" gap="3">
      <Flex justify="between" align="center" gap="3" wrap="wrap">
        <div>
          <Text size="3" weight="bold">{def.title} 接入信息</Text>
          <Text size="2" color="gray">填写最基本连接信息后执行一次测试。</Text>
        </div>
        <Badge color={probeState.badgeColor}>{probeState.badgeLabel}</Badge>
      </Flex>
      {def.credentials.map((cred) => (
        <label key={cred.key} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <Text size="2" weight="medium" style={{ color: "var(--text-strong)" }}>{cred.label}</Text>
          <TextField.Root 
            type={cred.secret ? "password" : "text"} 
            size="3" 
            placeholder={cred.placeholder}
            value={String((currentConfig as Record<string, unknown> | undefined)?.[cred.key] ?? "")}
            onChange={(e) => handleUpdate(cred.key, e.target.value)}
            style={{ height: "44px" }}
          />
        </label>
      ))}

      <Box mt="2">
        <Button onClick={() => void onTest()} disabled={studio.snapshot.busy}>
          测试连接
        </Button>
      </Box>

      {probeState.detail && (
        <Box p="3" style={{ background: "var(--bg-soft)", borderRadius: "12px", border: "1px solid var(--line-subtle)" }}>
          <Text size="2" style={{ color: probeState.detailColor }}>
            {probeState.detail}
          </Text>
        </Box>
      )}
    </Flex>
  );
}
