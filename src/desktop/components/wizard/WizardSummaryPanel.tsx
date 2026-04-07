import { Badge, Box, Flex, Text } from "@radix-ui/themes";
import type { ChannelKey, ValidationResult } from "../../../lib/models";

interface WizardSummaryPanelProps {
  readonly selectedChannel: ChannelKey;
  readonly selectedAgent: string;
  readonly effectiveAgent: string;
  readonly routeOverridden: boolean;
  readonly workdir: string;
  readonly hasProbeResult: boolean;
  readonly validation: ValidationResult | null;
}

export function WizardSummaryPanel({
  selectedChannel,
  selectedAgent,
  effectiveAgent,
  routeOverridden,
  workdir,
  hasProbeResult,
  validation,
}: WizardSummaryPanelProps) {
  return (
    <Box className="relaydesk-wizardSummary">
      <Text size="1" color="gray" weight="bold" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
        配置摘要
      </Text>
      <Flex direction="column" gap="3" mt="4">
        <div className="relaydesk-reviewRow">
          <Text size="2" color="gray">平台</Text>
          <Badge color="gray" variant="soft">{selectedChannel}</Badge>
        </div>
        <div className="relaydesk-reviewRow">
          <Text size="2" color="gray">AI</Text>
          <Badge color="gray" variant="soft">{selectedAgent}</Badge>
        </div>
        <div className="relaydesk-reviewRow">
          <Text size="2" color="gray">当前平台实际路由</Text>
          <Badge color={routeOverridden ? "amber" : "green"} variant="soft">
            {effectiveAgent}
          </Badge>
        </div>
        <div className="relaydesk-reviewRow">
          <Text size="2" color="gray">工作区</Text>
          <Badge color={workdir ? "green" : "gray"} variant="soft">
            {workdir ? "已设置" : "未配置"}
          </Badge>
        </div>
        {routeOverridden ? (
          <Text size="2" color="gray">
            当前平台存在单独 AI 覆盖，因此实际启动会优先使用 {effectiveAgent} 而不是全局默认值。
          </Text>
        ) : null}
        <div className="relaydesk-reviewRow">
          <Text size="2" color="gray">渠道测试</Text>
          <Badge color={hasProbeResult ? "green" : "gray"} variant="soft">
            {hasProbeResult ? "已执行" : "未执行"}
          </Badge>
        </div>
        <div className="relaydesk-reviewRow">
          <Text size="2" color="gray">预检</Text>
          <Badge color={validation?.ok ? "green" : "gray"} variant="soft">
            {validation?.ok ? "通过" : "待确认"}
          </Badge>
        </div>
      </Flex>
    </Box>
  );
}
