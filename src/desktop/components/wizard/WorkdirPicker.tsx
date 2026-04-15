import { Box, Button, Flex, Text, TextField } from "@radix-ui/themes";
import { Folder, FolderOpen } from "lucide-react";
import { desktopBridge } from "../../../lib/desktop";
import type { RelayDeskStudio } from "../../types";

interface WorkdirPickerProps {
  readonly studio: RelayDeskStudio;
}

function currentWorkdir(studio: RelayDeskStudio) {
  return studio.snapshot.workspace.tools?.claude?.workDir
    || studio.snapshot.workspace.tools?.codex?.workDir
    || "";
}

function setWorkdir(studio: RelayDeskStudio, value: string) {
  studio.actions.updateWorkspace((draft) => {
    if (draft.tools?.claude) {
      draft.tools.claude.workDir = value;
    }

    if (draft.tools?.codex) {
      draft.tools.codex.workDir = value;
    }
  });
}

export function WorkdirPicker({ studio }: WorkdirPickerProps) {
  const workdir = currentWorkdir(studio);
  const nativeEnabled = studio.snapshot.desktopSupported;

  async function browseDirectory() {
    const selected = await desktopBridge.pickDirectory({
      title: "选择默认工作区",
      startingPath: workdir || studio.snapshot.bootstrap?.diagnostics.appHome,
    });

    if (!selected) {
      return;
    }

    setWorkdir(studio, selected);
  }

  return (
    <Flex direction="column" gap="4">
      <Box className="relaydesk-fieldBlock" style={{ maxWidth: "100%" }}>
        <Text as="label" size="2" weight="medium">默认工作区</Text>
        <TextField.Root
          value={workdir}
          onChange={(event) => setWorkdir(studio, event.target.value)}
          placeholder="留空则回退到当前用户主目录"
          size="3"
        />
      </Box>

      <Flex gap="3" wrap="wrap">
        <Button onClick={() => void browseDirectory()} disabled={studio.snapshot.busy || !nativeEnabled}>
          <Folder size={16} />
          浏览目录
        </Button>
        <Button
          variant="soft"
          onClick={() => void studio.actions.openPath(workdir)}
          disabled={studio.snapshot.busy || !nativeEnabled || !workdir}
        >
          <FolderOpen size={16} />
          打开工作区
        </Button>
      </Flex>

      <Text size="2" color="gray">
        这个目录会作为默认会话工作区；如果留空，运行时会回退到当前用户主目录。
      </Text>
    </Flex>
  );
}
