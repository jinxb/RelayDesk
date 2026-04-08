import { Box, Flex, Heading, Text } from "@radix-ui/themes";
import { wizardSteps } from "./wizard-model";

interface WizardStepRailProps {
  readonly stepIndex: number;
  readonly onSelect: (index: number) => void;
}

export function WizardStepRail({ stepIndex, onSelect }: WizardStepRailProps) {
  return (
    <Box className="relaydesk-wizardRail">
      <Heading size="3" mb="4" weight="bold">安装向导</Heading>
      <Flex direction="column" gap="2">
        {wizardSteps.map((step, index) => {
          const state = index === stepIndex ? "active" : index < stepIndex ? "done" : "todo";

          return (
            <button
              key={step.key}
              type="button"
              className="relaydesk-wizardStep"
              data-state={state}
              onClick={() => {
                if (index <= stepIndex) {
                  onSelect(index);
                }
              }}
            >
              <span className="relaydesk-wizardStepIndex">{index + 1}</span>
              <span className="relaydesk-wizardStepCopy">
                <strong>{step.label}</strong>
              </span>
            </button>
          );
        })}
      </Flex>
    </Box>
  );
}
