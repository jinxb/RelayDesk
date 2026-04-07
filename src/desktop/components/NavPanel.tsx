import { Flex, Tooltip } from "@radix-ui/themes";
import {
  LayoutDashboard,
  Network,
  Settings,
  Activity,
  SlidersHorizontal,
} from "lucide-react";
import { studioViews } from "../catalog";
import type { RelayDeskStudio } from "../types";

interface NavPanelProps {
  readonly studio: RelayDeskStudio;
  readonly onOpenPreferences: () => void;
}

const iconMap = {
  console: <LayoutDashboard size={18} />,
  connection: <Network size={18} />,
  ai: <Settings size={18} />,
  diagnosis: <Activity size={18} />,
};

function RailButton({ studio, view }: { studio: RelayDeskStudio; view: (typeof studioViews)[number] }) {
  const active = studio.currentView === view.key;

  return (
    <button
      type="button"
      className="relaydesk-navButton"
      aria-current={active ? "page" : undefined}
      data-active={active}
      onClick={() => studio.actions.setCurrentView(view.key)}
    >
      <span className="relaydesk-navGlyph">{iconMap[view.key]}</span>
      <span className="relaydesk-navCopy">
        <strong>{view.navLabel}</strong>
        <span>{view.eyebrow}</span>
      </span>
    </button>
  );
}

export function NavPanel({ studio, onOpenPreferences }: NavPanelProps) {
  return (
    <aside className="relaydesk-rail">
      <Flex direction="column" justify="between" className="relaydesk-railInner relaydesk-railInner--full">
        <Flex direction="column" className="relaydesk-railSection">
          <div className="relaydesk-railTopGap" aria-hidden="true" />
          <Flex direction="column" className="relaydesk-navGroup">
            {studioViews.map((view) => (
              <RailButton key={view.key} studio={studio} view={view} />
            ))}
          </Flex>
        </Flex>
        <div className="relaydesk-railUtility">
          <Tooltip content="高级工具">
            <button
              type="button"
              className="relaydesk-navButton relaydesk-navButton--utility"
              onClick={() => onOpenPreferences()}
            >
              <span className="relaydesk-navGlyph">
                <SlidersHorizontal size={18} />
              </span>
              <span className="relaydesk-navCopy">
                <strong>高级</strong>
              </span>
            </button>
          </Tooltip>
        </div>
      </Flex>
    </aside>
  );
}
