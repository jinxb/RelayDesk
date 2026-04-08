import { Button, Flex } from "@radix-ui/themes";
import { ArrowLeft, ArrowRight, LoaderCircle, Rocket, Save } from "lucide-react";

interface WizardFooterProps {
  readonly stepIndex: number;
  readonly canContinue: boolean;
  readonly busy: boolean;
  readonly starting: boolean;
  readonly validationOk: boolean;
  readonly onBack: () => void;
  readonly onSaveOnly: () => Promise<void>;
  readonly onForward: () => Promise<void>;
  readonly onStopRuntime: () => Promise<void>;
}

export function WizardFooter({
  stepIndex,
  canContinue,
  busy,
  starting,
  validationOk,
  onBack,
  onSaveOnly,
  onForward,
  onStopRuntime,
}: WizardFooterProps) {
  const isReviewStep = stepIndex === 4;
  const primaryDisabled = busy || (!starting && !canContinue);
  const primaryLabel = isReviewStep
    ? starting ? "停止启动" : "完成并启动"
    : "继续";

  return (
    <Flex justify="between" align="center" gap="3" mt="3" wrap="wrap">
      <Flex gap="2">
        <Button
          variant="soft"
          color="gray"
          onClick={onBack}
          disabled={stepIndex === 0 || busy}
        >
          <ArrowLeft size={16} />
          上一步
        </Button>
      </Flex>

      <Flex gap="2" wrap="wrap">
        {isReviewStep ? (
          <Button
            variant="soft"
            color="gray"
            onClick={() => void onSaveOnly()}
            disabled={busy || !validationOk}
          >
            <Save size={16} />
            仅保存配置
          </Button>
        ) : null}
        <Button
          onClick={() => void (isReviewStep && starting ? onStopRuntime() : onForward())}
          disabled={primaryDisabled}
          style={{ background: "var(--accent)", color: "white" }}
        >
          {isReviewStep
            ? starting ? <LoaderCircle size={16} className="relaydesk-spin" /> : <Rocket size={16} />
            : <ArrowRight size={16} />}
          {primaryLabel}
        </Button>
      </Flex>
    </Flex>
  );
}
