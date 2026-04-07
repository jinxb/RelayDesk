import { Badge, Button, Flex, Text } from "@radix-ui/themes";
import { FileCode2, FolderOpen, Info } from "lucide-react";
import type { RelayDeskStudio } from "../types";
import { SettingsUpdateActions } from "./UpdateStatusControls";

interface AboutViewProps {
  readonly studio: RelayDeskStudio;
}

export function AboutView({ studio }: AboutViewProps) {
  const diagnostics = studio.snapshot.bootstrap?.diagnostics;
  const nativeEnabled = studio.snapshot.desktopSupported;

  return (
    <Flex direction="column" gap="4">
      <section className="relaydesk-dashCard">
        <Flex justify="between" align="start" gap="3" wrap="wrap">
          <Flex direction="column" gap="2">
            <Flex align="center" gap="2">
              <Info size={16} />
              <Text size="3" weight="bold">应用信息</Text>
            </Flex>
          </Flex>
          <Badge color="gray">
            {studio.snapshot.shellIdentity?.release ?? "未知版本"}
          </Badge>
        </Flex>
        <Flex gap="2" wrap="wrap">
          <SettingsUpdateActions studio={studio} />
        </Flex>
      </section>

      <section className="relaydesk-dashCard">
        <Text size="3" weight="bold">桌面目录</Text>
        <Flex direction="column" gap="2">
          <Flex justify="between" align="center" gap="3" wrap="wrap">
            <Flex direction="column" gap="1">
              <Text size="2" weight="medium">应用目录</Text>
              <Text size="2" color="gray">{diagnostics?.appHome ?? "不可用"}</Text>
            </Flex>
            <Button
              variant="soft"
              size="1"
              onClick={() => void studio.actions.openPath(diagnostics?.appHome ?? "")}
              disabled={!nativeEnabled || !diagnostics?.appHome}
            >
              <FolderOpen size={14} />
              打开
            </Button>
          </Flex>
          <Flex justify="between" align="center" gap="3" wrap="wrap">
            <Flex direction="column" gap="1">
              <Text size="2" weight="medium">配置文件</Text>
              <Text size="2" color="gray">{diagnostics?.configPath ?? "不可用"}</Text>
            </Flex>
            <Button
              variant="soft"
              color="gray"
              size="1"
              onClick={() => void studio.actions.revealPath(diagnostics?.configPath ?? "")}
              disabled={!nativeEnabled || !diagnostics?.configPath}
            >
              <FileCode2 size={14} />
              定位
            </Button>
          </Flex>
          <Flex justify="between" align="center" gap="3" wrap="wrap">
            <Flex direction="column" gap="1">
              <Text size="2" weight="medium">日志目录</Text>
              <Text size="2" color="gray">{diagnostics?.logDir ?? "不可用"}</Text>
            </Flex>
            <Button
              variant="soft"
              color="gray"
              size="1"
              onClick={() => void studio.actions.openPath(diagnostics?.logDir ?? "")}
              disabled={!nativeEnabled || !diagnostics?.logDir}
            >
              <FolderOpen size={14} />
              打开
            </Button>
          </Flex>
        </Flex>
      </section>
    </Flex>
  );
}
