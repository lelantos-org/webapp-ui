import type { Step, TxPhase } from "@/features/tx";
import { Modal } from "@/shared/ui/Modal";
import { Stepper } from "@/shared/ui/Stepper";
import { SuccessCheck } from "./SuccessCheck";

type ModalScreen = "running" | "success";

const TITLES: Record<ModalScreen, string> = {
  running: "Creating your link",
  success: "Link ready",
};

export interface GenerateModalProps {
  screen: ModalScreen;
  amountLabel: string;
  steps: Step[];
  activePhase: TxPhase | undefined;
  /// Applies the fade-out; the parent unmounts afterwards.
  closing?: boolean;
}

/// The claim-link modal: transfer progress, then the success tick.
export function GenerateModal({
  screen,
  amountLabel,
  steps,
  activePhase,
  closing = false,
}: GenerateModalProps) {
  // Never dismissable: the bearer key for funds in flight exists nowhere else yet.
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
