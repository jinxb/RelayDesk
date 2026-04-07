import { Button, Dialog, Flex } from "@radix-ui/themes";
import type { ReactNode } from "react";

interface ConfigDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  /** Extra class on Dialog.Content, e.g. "relaydesk-channelDialog" */
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * Shared dialog shell: title + optional description + scrollable body + fixed close button.
 * All config dialogs (channel, AI tool, preferences) should use this.
 */
export function ConfigDialog({ open, onOpenChange, title, description, className, children }: ConfigDialogProps) {
  const cls = ["relaydesk-configDialog", className].filter(Boolean).join(" ");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className={cls}>
        <Dialog.Title>{title}</Dialog.Title>
        {description ? <Dialog.Description size="2" color="gray">{description}</Dialog.Description> : null}

        <div className="relaydesk-dialogBody">
          {children}
        </div>

        <Flex justify="end" className="relaydesk-dialogFooter">
          <Dialog.Close>
            <Button variant="soft" color="gray">关闭</Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
