import { Badge, Box, Button, Flex, Heading, Text } from "@radix-ui/themes";
import type { ChannelKey, ValidationResult } from "../../../lib/models";
import { channelDefinitions } from "../../catalog";
import type { RelayDeskStudio } from "../../types";

interface SetupReviewProps {
  readonly studio: RelayDeskStudio;
  readonly selectedChannel: ChannelKey;
  readonly effectiveAgent: string;
  readonly routeOverridden: boolean;
  readonly validation: ValidationResult | null;
  readonly validating: boolean;
  readonly onValidate: () => Promise<void>;
}

function currentWorkdir(studio: RelayDeskStudio) {
  return studio.snapshot.workspace.tools?.claude?.workDir
    || studio.snapshot.workspace.tools?.codex?.workDir
    || "未设置";
}

function channelTitle(channelKey: ChannelKey) {
  return channelDefinitions.find((item) => item.key === channelKey)?.title ?? channelKey;
}

export function SetupReview({
  studio,
  selectedChannel,
  effectiveAgent,
  routeOverridden,
  validation,
  validating,
  onValidate,
}: SetupReviewProps) {
  return (
    <Flex direction="column" gap="4">
      <Box className="relaydesk-surface" style={{ padding: 20 }}>
        <Flex direction="column" gap="3">
          <Heading size="4">即将完成首次接入</Heading>
          <div className="relaydesk-reviewList">
            <div className="relaydesk-reviewRow">
              <Text size="2" color="gray">聊天平台</Text>
              <Text size="2" weight="medium">{channelTitle(selectedChannel)}</Text>
            </div>
            <div className="relaydesk-reviewRow">
              <Text size="2" color="gray">默认 AI</Text>
              <Text size="2" weight="medium">{studio.snapshot.workspace.aiCommand ?? "claude"}</Text>
            </div>
            <div className="relaydesk-reviewRow">
              <Text size="2" color="gray">当前平台实际路由</Text>
              <Text size="2" weight="medium">{effectiveAgent}</Text>
            </div>
            <div className="relaydesk-reviewRow">
              <Text size="2" color="gray">工作区</Text>
              <Text size="2" weight="medium">{currentWorkdir(studio)}</Text>
            </div>
            <div className="relaydesk-reviewRow">
              <Text size="2" color="gray">对话模式</Text>
              <Text size="2" weight="medium">新开对话</Text>
            </div>
          </div>
          {routeOverridden ? (
            <Text size="2" color="gray">
              这条平台当前存在单独路由覆盖，因此实际启动会优先使用 {effectiveAgent}。
            </Text>
          ) : null}
        </Flex>
      </Box>

      <Box className="relaydesk-surface" style={{ padding: 20 }}>
        <Flex justify="between" align="start" gap="3" wrap="wrap">
          <div>
            <Text size="3" weight="bold">启动前预检</Text>
            <Text size="2" color="gray">
              这里使用当前本地配置执行正式预检。只有通过后，保存和启动才会退出首次配置模式。
            </Text>
          </div>
          <Button variant="soft" onClick={() => void onValidate()} disabled={validating}>
            {validating ? "检查中…" : "刷新预检"}
          </Button>
        </Flex>

        <Flex direction="column" gap="3" mt="4">
          {validation ? (
            <>
              <Badge color={validation.ok ? "green" : "amber"} style={{ width: "fit-content" }}>
                {validation.ok ? "预检通过" : `${validation.issues.length} 项待处理`}
              </Badge>
              {validation.issues.length > 0 ? (
                <div className="relaydesk-reviewIssues">
                  {validation.issues.map((issue) => (
                    <div key={issue} className="relaydesk-reviewIssue">
                      <Text size="2">{issue}</Text>
                    </div>
                  ))}
                </div>
              ) : (
                <Text size="2" color="gray">
                  当前配置已满足启动条件，完成后即可进入控制台。
                </Text>
              )}
            </>
          ) : (
            <Text size="2" color="gray">
              还没有执行预检。点击“刷新预检”确认当前配置是否可直接启动。
            </Text>
          )}
        </Flex>
      </Box>
    </Flex>
  );
}
