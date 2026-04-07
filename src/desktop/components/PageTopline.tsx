import { Flex, Text } from "@radix-ui/themes";
import { WindowDragRegion } from "./WindowDragRegion";

interface PageToplineProps {
  readonly title: string;
  readonly summary?: string;
  readonly actions?: React.ReactNode;
}

export function PageTopline({ title, summary, actions }: PageToplineProps) {
  return (
    <div className="relaydesk-pageTopline">
      <WindowDragRegion className="relaydesk-pageToplineIdentity">
        <Text size="5" weight="bold">{title}</Text>
        {summary ? <Text size="2" color="gray">{summary}</Text> : null}
      </WindowDragRegion>
      {actions ? <Flex align="center" gap="2" className="relaydesk-pageToplineActions">{actions}</Flex> : null}
    </div>
  );
}
