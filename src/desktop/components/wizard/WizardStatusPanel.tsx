import { Box, Flex, Text } from "@radix-ui/themes";
import { Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { isRuntimeStarting } from "../../runtime-state";
import type { RelayDeskStudio } from "../../types";

interface WizardStatusPanelProps {
  readonly studio: RelayDeskStudio;
}

function shouldShow(studio: RelayDeskStudio) {
  if (studio.snapshot.busy) {
    return true;
  }

  if (isRuntimeStarting(studio.snapshot)) {
    return true;
  }

  if (!studio.snapshot.status.message) {
    return false;
  }

  return studio.snapshot.status.tone === "danger" || studio.snapshot.status.tone === "warning";
}

function statusIcon(studio: RelayDeskStudio) {
  if (studio.snapshot.busy || isRuntimeStarting(studio.snapshot)) {
    return <LoaderCircle size={16} className="relaydesk-spin" color="var(--info)" />;
  }

  if (studio.snapshot.status.tone === "danger") {
    return <TriangleAlert size={16} color="var(--danger)" />;
  }

  if (studio.snapshot.status.tone === "warning") {
    return <TriangleAlert size={16} color="var(--warning)" />;
  }

  return <Info size={16} color="var(--info)" />;
}

export function WizardStatusPanel({ studio }: WizardStatusPanelProps) {
  if (!shouldShow(studio)) {
    return null;
  }

  return (
    <Box className="relaydesk-wizardStatus">
      <Flex align="center" gap="2">
        {statusIcon(studio)}
        <Text size="2">
          {studio.snapshot.busyMessage ?? studio.snapshot.status.message}
        </Text>
      </Flex>
    </Box>
  );
}
