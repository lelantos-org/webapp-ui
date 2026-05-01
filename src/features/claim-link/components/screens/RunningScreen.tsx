import type { Step, TxPhase } from "@/features/actions/tx-progress";
import { Stepper } from "@/shared/ui/Stepper";

interface RunningScreenProps {
  amountLabel: string;
  steps: Step[];
  activePhase: TxPhase | undefined;
}

/// In-flight stepper; caller must keep the modal mounted until the mutation settles.
export function RunningScreen({ amountLabel, steps, activePhase }: RunningScreenProps) {
  const failed = activePhase === "failed";
  return (
    <>
      <p className="setup-copy">
        Sending <strong>{amountLabel}</strong> to a fresh ephemeral address. Keep this window open
        until the link is ready.
      </p>
      <Stepper steps={steps} current={activePhase} failed={failed} />
      <p className="setup-meta">Do not close this window.</p>
    </>
  );
}
