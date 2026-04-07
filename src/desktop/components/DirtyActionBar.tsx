import { Box, Button, Flex, Text } from "@radix-ui/themes";
import { Save, AlertCircle } from "lucide-react";
import type { RelayDeskStudio } from "../types";

export function DirtyActionBar({ studio }: { studio: RelayDeskStudio }) {
  if (!studio.snapshot.dirty && !studio.snapshot.rawDraft) {
    return null;
  }

  return (
    <Box className="relaydesk-dirtyBar" style={{
      position: "sticky",
      bottom: 0,
      padding: "16px 24px",
      background: "var(--bg-surface)",
      borderTop: "1px solid var(--line-subtle)",
      zIndex: 10,
      boxShadow: "0 -4px 12px rgba(0,0,0,0.02)"
    }}>
      <Flex justify="between" align="center">
        <Flex align="center" gap="2">
          <AlertCircle size={16} color="var(--warning)" />
          <Text size="2" color="gray">
            {studio.snapshot.rawDraft ? "原始配置有未应用的更改" : "有未保存的表单更改"}
          </Text>
        </Flex>
        <Flex gap="3">
          <Button variant="soft" color="gray" onClick={() => void studio.actions.refresh()} disabled={studio.snapshot.busy}>
            放弃更改
          </Button>
          <Button variant="soft" onClick={() => void studio.actions.validateWorkspace()} disabled={studio.snapshot.busy}>
            保存前校验
          </Button>
          <Button onClick={() => void studio.actions.saveWorkspace()} disabled={studio.snapshot.busy} style={{ background: "var(--accent)", color: "white" }}>
            <Save size={16} />
            保存更改
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
}
