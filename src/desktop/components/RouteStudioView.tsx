import { Button, Flex, Box, Text, TextField } from "@radix-ui/themes";
import { FolderOpen, WandSparkles } from "lucide-react";
import type { RelayDeskStudio } from "../types";
import { resolvePreferredWorkdir, setPreferredWorkdir } from "../workspace";
import { ToolSettingsCards } from "./ToolSettingsCards";

interface RouteStudioViewProps {
  readonly studio: RelayDeskStudio;
}

/* ── Layer 3: Workspace & log config ── */

function WorkspaceLogCard({ studio }: { studio: RelayDeskStudio }) {
  const workdir = resolvePreferredWorkdir(studio.snapshot.workspace) || "未设置";
  const nativeEnabled = studio.snapshot.desktopSupported;

  return (
    <section className="relaydesk-dashCard relaydesk-settingsStorage">
      <Flex justify="between" align="center" gap="3" wrap="wrap">
        <Flex align="center" gap="2">
          <FolderOpen size={15} />
          <Text size="3" weight="bold">工作区与日志</Text>
        </Flex>
        <Flex gap="2">
          <Button variant="soft" size="1" onClick={() => void studio.actions.openPath(workdir)} disabled={studio.snapshot.busy || !nativeEnabled || !workdir || workdir === "未设置"}>
            <WandSparkles size={14} />
            打开工作区
          </Button>
        </Flex>
      </Flex>

      <div className="relaydesk-settingsStorageIntro">
        <Text size="2" color="gray" className="relaydesk-settingsStorageHint">
          {workdir === "未设置"
            ? "当前未显式设置默认工作区；运行时将回退到当前用户主目录。"
            : `当前默认工作区：${workdir}`}
        </Text>
      </div>

      <Box className="relaydesk-fieldBlock relaydesk-fieldBlock--wide" style={{ maxWidth: "100%" }}>
          <Text as="label" size="2" weight="medium">默认工作区</Text>
          <Flex gap="2" align="center">
            <TextField.Root
              style={{ flex: 1 }}
              value={workdir === "未设置" ? "" : workdir}
              placeholder="留空则回退到当前用户主目录"
              onChange={(e) => {
                studio.actions.updateWorkspace((draft) => {
                  setPreferredWorkdir(draft, e.target.value);
                });
              }}
            />
            <Button
              variant="soft"
              size="1"
              onClick={() => void studio.actions.pickDefaultWorkTree()}
              disabled={studio.snapshot.busy || !nativeEnabled}
            >
              选择
            </Button>
          </Flex>
      </Box>
    </section>
  );
}

/* ── Root ── */

export function RouteStudioView({ studio }: RouteStudioViewProps) {
  return (
    <Flex direction="column" gap="4" className="relaydesk-settingsStack">
      <ToolSettingsCards studio={studio} />
      <WorkspaceLogCard studio={studio} />
    </Flex>
  );
}
