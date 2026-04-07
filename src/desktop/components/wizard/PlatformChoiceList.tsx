import { Badge, Card, Flex, Grid, Text } from "@radix-ui/themes";
import { channelDefinitions } from "../../catalog";
import type { ChannelKey } from "../../../lib/models";

interface PlatformChoiceListProps {
  readonly value: ChannelKey | null;
  readonly onChange: (key: ChannelKey) => void;
}

export function PlatformChoiceList({ value, onChange }: PlatformChoiceListProps) {
  return (
    <Grid columns="2" gap="4">
      {channelDefinitions.map((def) => {
        const active = value === def.key;
        return (
          <Card 
            key={def.key} 
            variant={active ? "classic" : "surface"} 
            style={{ 
              cursor: "pointer", 
              outline: active ? "2px solid var(--accent)" : "none",
              background: active ? "var(--bg-surface)" : "var(--bg-soft)"
            }}
            onClick={() => onChange(def.key)}
          >
            <Flex direction="column" gap="2">
              <Flex align="center" justify="between" gap="2">
                <Text size="3" weight="bold" style={{ color: "var(--text-strong)" }}>{def.title}</Text>
                {active ? <Badge color="green">已选择</Badge> : null}
              </Flex>
              <Text size="2" color="gray" style={{ minHeight: "40px" }}>{def.summary}</Text>
              <Text
                size="1"
                color="gray"
                style={{
                  padding: "4px 8px",
                  background: "rgba(0,0,0,0.04)",
                  width: "fit-content",
                  borderRadius: "99px",
                }}
              >
                {def.mode}
              </Text>
            </Flex>
          </Card>
        );
      })}
    </Grid>
  );
}
