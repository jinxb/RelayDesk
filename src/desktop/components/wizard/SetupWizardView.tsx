import { Box, Heading, Text } from "@radix-ui/themes";
import type { RelayDeskStudio } from "../../types";
import { AiChoicePanel } from "./AiChoicePanel";
import { PlatformChoiceList } from "./PlatformChoiceList";
import { PlatformSetupForm } from "./PlatformSetupForm";
import { SetupReview } from "./SetupReview";
import { WizardFooter } from "./WizardFooter";
import { wizardSteps } from "./wizard-model";
import { WizardStepRail } from "./WizardStepRail";
import { WizardSummaryPanel } from "./WizardSummaryPanel";
import { WizardStatusPanel } from "./WizardStatusPanel";
import { WorkdirPicker } from "./WorkdirPicker";
import { WindowDragRegion } from "../WindowDragRegion";
import { useSetupWizardState } from "./useSetupWizardState";
import { isRuntimeStarting } from "../../runtime-state";

export function SetupWizardView({ studio }: { studio: RelayDeskStudio }) {
  const wizard = useSetupWizardState(studio);
  const activeStep = wizardSteps[wizard.stepIndex];
  const runtimeStarting = isRuntimeStarting(studio.snapshot);

  return (
    <Box className="relaydesk-wizardDialog">
      <WizardStepRail stepIndex={wizard.stepIndex} onSelect={wizard.setStepIndex} />

      <Box className="relaydesk-wizardMain">
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 40, zIndex: 10 }}>
          <WindowDragRegion><div style={{ width: "100%", height: "100%" }} /></WindowDragRegion>
        </div>

        <Heading size="6" mb="1" mt="2">{activeStep.label}</Heading>
        <Text size="2" color="gray" mb="6">{activeStep.description}</Text>

        <WizardStatusPanel studio={studio} />

        <Box style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4, marginRight: -8 }}>
          {wizard.stepIndex === 0 ? (
            <PlatformChoiceList value={wizard.selectedChannel} onChange={wizard.chooseChannel} />
          ) : null}

          {wizard.stepIndex === 1 ? (
            <PlatformSetupForm
              channelKey={wizard.selectedChannel}
              studio={studio}
              onTest={() => studio.actions.probeChannel(wizard.selectedChannel)}
            />
          ) : null}

          {wizard.stepIndex === 2 ? <AiChoicePanel studio={studio} /> : null}
          {wizard.stepIndex === 3 ? <WorkdirPicker studio={studio} /> : null}
          {wizard.stepIndex === 4 ? (
            <SetupReview
              studio={studio}
              selectedChannel={wizard.selectedChannel}
              effectiveAgent={wizard.effectiveAgent}
              routeOverridden={wizard.routeOverridden}
              validation={wizard.validation}
              validating={wizard.validating}
              onValidate={wizard.runValidation}
            />
          ) : null}
        </Box>

        <WizardFooter
          stepIndex={wizard.stepIndex}
          canContinue={wizard.canContinue()}
          busy={studio.snapshot.busy}
          starting={runtimeStarting}
          validationOk={Boolean(wizard.validation?.ok)}
          onBack={() => wizard.setStepIndex((current) => Math.max(0, current - 1))}
          onSaveOnly={wizard.saveOnly}
          onForward={wizard.moveForward}
          onStopRuntime={studio.actions.stopRuntime}
        />
      </Box>
    </Box>
  );
}
