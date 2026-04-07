import { Flex, Text } from "@radix-ui/themes";

interface RouteLaneCardProps {
  readonly eyebrow?: string;
  readonly title: string;
  readonly summary?: string;
  readonly actions?: React.ReactNode;
  readonly children?: React.ReactNode;
}

export function RouteLaneCard({
  title,
  summary,
  actions,
  children,
}: RouteLaneCardProps) {
  return (
    <section className="relaydesk-dashCard relaydesk-routeLane">
      <Flex direction="column" gap="4">
        <Flex justify="between" align="start" gap="4" wrap="wrap">
          <div className="relaydesk-routeLaneIdentity">
            <Text size="3" weight="bold">{title}</Text>
            {summary ? <Text size="2" color="gray" className="relaydesk-routeLaneSummary">{summary}</Text> : null}
          </div>
          {actions}
        </Flex>
        {children ? <Flex direction="column" gap="3">{children}</Flex> : null}
      </Flex>
    </section>
  );
}
