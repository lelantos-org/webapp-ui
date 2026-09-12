// Modal for the generate-claim-link flow: the transfer in flight, then the
// success tick while the link is prepared.
//
// The exit is driven from outside: `useClaimLinkStage` holds the modal mounted
// in a `closing` stage for the length of the fade, so this only forwards it.
//
// A modal rather than `ActionForm`'s progress card, deliberately: the bearer key
// the transfer produces exists only in this component tree until the result is
// shown, so the flow holds the whole screen and cannot be dismissed while it
// runs.

import type { Step, TxPhase } from "@/features/tx";
import { Modal } from "@/shared/ui/Modal";
import { Stepper } from "@/shared/ui/Stepper";
import { SuccessCheck } from "@/shared/ui/SuccessCheck";

export type ModalScreen = "running" | "success";

const TITLES: Record<ModalScreen, string> = {
  running: "Creating your link",
  success: "Link ready",
};

export interface GenerateModalProps {
  screen: ModalScreen;
  amountLabel: string;
  steps: Step[];
  activePhase: TxPhase | undefined;
  /// Applies the fade-out animation; the parent unmounts after the CSS transition
  /// completes.
  closing?: boolean;
}

export function GenerateModal({
  screen,
  amountLabel,
  steps,
  activePhase,
  closing = false,
}: GenerateModalProps) {
  // Never dismissable: a transfer is in flight and the bearer key it produces
  // exists nowhere else yet.
  return (
    <Modal title={TITLES[screen]} busy exiting={closing} focusKey={screen}>
      {screen === "success" ? (
        <SuccessScreen amountLabel={amountLabel} />
      ) : (
        <RunningScreen amountLabel={amountLabel} steps={steps} activePhase={activePhase} />
      )}
    </Modal>
  );
}

/// In-flight stepper; caller must keep the modal mounted until the mutation settles.
export function RunningScreen({
  amountLabel,
  steps,
  activePhase,
}: {
  amountLabel: string;
  steps: Step[];
  activePhase: TxPhase | undefined;
}) {
  const failed = activePhase === "failed";
  return (
    <>
      <p className="modal-copy">
        Sending <strong>{amountLabel}</strong> to a fresh address only the link can spend. Keep this
        tab open until the link is ready — it exists nowhere else until then.
      </p>
      <Stepper steps={steps} current={activePhase} failed={failed} />
      <p className="modal-meta">Do not close this tab.</p>
    </>
  );
}

/// Post-broadcast confirmation. Auto-advances after a short dwell — see
/// `useClaimLinkStage`'s `runWith`.
function SuccessScreen({ amountLabel }: { amountLabel: string }) {
  return (
    <SuccessCheck
      caption={
        amountLabel ? (
          <>
            <strong>{amountLabel}</strong> sent. Preparing your link…
          </>
        ) : (
          "Sent. Preparing your link…"
        )
      }
    />
  );
}
