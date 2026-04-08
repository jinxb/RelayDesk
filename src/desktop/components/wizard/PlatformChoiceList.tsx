import { Badge, Text } from "@radix-ui/themes";
import { channelDefinitions } from "../../catalog";
import type { ChannelKey } from "../../../lib/models";

interface PlatformChoiceListProps {
  readonly value: ChannelKey | null;
  readonly onChange: (key: ChannelKey) => void;
}

function compactSummary(summary: string) {
  const text = summary.replace(/，已支持原生图片与文件回传。?/g, "");
  return text.length > 26 ? `${text.slice(0, 26)}...` : text;
}

export function PlatformChoiceList({ value, onChange }: PlatformChoiceListProps) {
  return (
    <div className="relaydesk-wizardPlatformGrid">
      {channelDefinitions.map((def) => {
        const active = value === def.key;
        return (
          <button
            key={def.key}
            type="button"
            className="relaydesk-wizardPlatformCard"
            data-active={active}
            onClick={() => onChange(def.key)}
          >
            <div className="relaydesk-wizardPlatformCardTopline">
              <Text size="4" weight="bold">{def.title}</Text>
              {active ? <Badge color="green" radius="full">已选</Badge> : null}
            </div>
            <Text size="2" color="gray" className="relaydesk-wizardPlatformCardCopy">
              {compactSummary(def.summary)}
            </Text>
            <span className="relaydesk-wizardPlatformCardMeta">{def.mode}</span>
          </button>
        );
      })}
    </div>
  );
}
