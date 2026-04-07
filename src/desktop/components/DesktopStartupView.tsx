import { Button, Flex, Heading, Text } from "@radix-ui/themes";
import { LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import type { RelayDeskStudio } from "../types";
import { WindowDragRegion } from "./WindowDragRegion";

interface DesktopStartupViewProps {
  readonly studio: RelayDeskStudio;
}

function startupTitle(studio: RelayDeskStudio) {
  if (studio.snapshot.busy) return "正在启动 RelayDesk";
  if (studio.snapshot.status.tone === "danger") return "启动失败";
  return "正在准备桌面工作台";
}

function startupDetail(studio: RelayDeskStudio) {
  if (studio.snapshot.status.message) {
    return studio.snapshot.status.message;
  }

  return "正在读取本地配置、检测桥接状态，并准备桌面工作台。";
}

export function DesktopStartupView({ studio }: DesktopStartupViewProps) {
  return (
    <div className="relaydesk-startupFull">
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 40, zIndex: 10 }}>
        <WindowDragRegion><div style={{ width: "100%", height: "100%" }} /></WindowDragRegion>
      </div>
      <Flex direction="column" align="center" gap="6">
        <Flex direction="column" align="center" gap="2">
          <Heading size="6" weight="bold">{startupTitle(studio)}</Heading>
          <Text size="2" color="gray" align="center" style={{ maxWidth: 300 }}>
            {startupDetail(studio)}
          </Text>
        </Flex>

        <Flex direction="column" align="center" gap="4">
          {studio.snapshot.busy ? (
            <LoaderCircle className="relaydesk-spin" size={24} color="var(--accent)" />
          ) : (
            <TriangleAlert size={24} color="var(--amber-10)" />
          )}
          
          <Button
            variant="soft"
            highContrast
            onClick={() => void studio.actions.refresh()}
            disabled={studio.snapshot.busy}
            style={{ borderRadius: 12, cursor: "pointer" }}
          >
            <RefreshCw size={14} />
            重新连接
          </Button>
        </Flex>
      </Flex>
    </div>
  );
}
