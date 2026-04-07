import { Button, Dialog, Flex, Tabs } from "@radix-ui/themes";
import { Settings2 } from "lucide-react";
import type { RelayDeskStudio } from "../types";
import { AboutView } from "./AboutView";
import { RuntimeControlView } from "./RuntimeControlView";
import { SourceEditorView } from "./SourceEditorView";

export type AdvancedTab = "runtime" | "about" | "source";

interface PreferencesModalProps {
  readonly studio: RelayDeskStudio;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly tab: AdvancedTab;
  readonly onTabChange: (tab: AdvancedTab) => void;
}

export function PreferencesModal({ studio, open, onOpenChange, tab, onTabChange }: PreferencesModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className="relaydesk-preferencesDialog" size="4">
        <Flex direction="column" className="relaydesk-preferencesLayout">
          {/* ── Header (fixed) ── */}
          <div>
            <Dialog.Title>
              <Flex align="center" gap="2">
                <Settings2 size={18} />
                高级工具
              </Flex>
            </Dialog.Title>
          </div>

          {/* ── Tabs + body (flexible, fills remaining space) ── */}
          <Tabs.Root value={tab} onValueChange={(value) => onTabChange(value as AdvancedTab)} className="relaydesk-preferencesTabs">
            <Tabs.List size="2">
              <Tabs.Trigger value="runtime">桥接</Tabs.Trigger>
              <Tabs.Trigger value="source">配置</Tabs.Trigger>
              <Tabs.Trigger value="about">关于</Tabs.Trigger>
            </Tabs.List>

            <div className="relaydesk-preferencesBody">
              <Tabs.Content value="runtime">
                <RuntimeControlView studio={studio} />
              </Tabs.Content>
              <Tabs.Content value="about">
                <AboutView studio={studio} />
              </Tabs.Content>
              <Tabs.Content value="source">
                <SourceEditorView studio={studio} />
              </Tabs.Content>
            </div>
          </Tabs.Root>

          {/* ── Footer (fixed at bottom) ── */}
          <Flex justify="end" className="relaydesk-dialogFooter">
            <Dialog.Close>
              <Button variant="soft" color="gray">关闭</Button>
            </Dialog.Close>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
