import type { RelayDeskStudio } from "../types";
import { Flex } from "@radix-ui/themes";
import { PageTopline } from "./PageTopline";
import { RouteStudioView } from "./RouteStudioView";

interface SettingsViewProps {
  readonly studio: RelayDeskStudio;
}

export function SettingsView({ studio }: SettingsViewProps) {
  return (
    <Flex direction="column" className="relaydesk-pageSection">
      <PageTopline
        title="AI"
        summary="管理默认 AI、默认工作区和本机工具配置。"
      />
      <RouteStudioView studio={studio} />
    </Flex>
  );
}
