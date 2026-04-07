import { Flex, Text } from "@radix-ui/themes";
import { MonitorSmartphone } from "lucide-react";
import type { RelayDeskStudio } from "../types";

interface PreviewModeNoticeProps {
  readonly studio: RelayDeskStudio;
}

export function PreviewModeNotice({ studio }: PreviewModeNoticeProps) {
  if (studio.snapshot.desktopSupported || studio.snapshot.loading) {
    return null;
  }

  return (
    <div className="relaydesk-previewNotice">
      <Flex align="center" gap="2">
        <MonitorSmartphone size={16} />
        <Text size="2">
          当前是浏览器预览模式。这里只用于查看界面布局，原生托盘、目录选择器和桌面桥接不会启用。
        </Text>
      </Flex>
    </div>
  );
}

