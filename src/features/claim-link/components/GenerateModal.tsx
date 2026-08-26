// Modal for the generate-claim-link flow.
//
// The exit is driven from outside: `useClaimLinkStage` holds the modal mounted
// in a `closing` stage for the length of the fade, so this only forwards it.

import type { Step, TxPhase } from "@/features/actions";
import { Modal } from "@/shared/ui/Modal";
import { ConfirmScreen } from "./screens/ConfirmScreen";
import { RunningScreen } from "./screens/RunningScreen";
import { SuccessScreen } from "./screens/SuccessScreen";

export type ModalScreen = "confirm" | "running" | "success";

const TITLES: Record<ModalScreen, string> = {
  confirm: "Confirm claim link",
  running: "Generating claim link",
  success: "Link ready",
};

export interface GenerateModalProps {
  screen: ModalScreen;
  amountLabel: string;
  /// Shown when `amountLabel` is empty, before the parse has produced a labelled
  /// value.
  rawAmountInput: string;
  steps: Step[];
  activePhase: TxPhase | undefined;
  /// Applies the fade-out animation; the parent unmounts after the CSS transition
  /// completes.
  closing?: boolean;
  onCancel(): void;
  onConfirm(): void;
}

export function GenerateModal(props: GenerateModalProps) {
  const { screen, closing = false, onCancel } = props;
  // Only the pre-broadcast screen may be dismissed: past it a transfer is in
  // flight and the bearer key it produces exists nowhere else.
  return (
    <Modal
      title={TITLES[screen]}
      onDismiss={onCancel}
      busy={screen !== "confirm"}
      exiting={closing}
      focusKey={screen}
    >
      <ScreenContent {...props} />
    </Modal>
  );
}

function ScreenContent({
  screen,
  amountLabel,
  rawAmountInput,
  steps,
  activePhase,
  onCancel,
  onConfirm,
}: GenerateModalProps) {
  switch (screen) {
    case "confirm":
      return (
        <ConfirmScreen
          amountLabel={amountLabel || rawAmountInput}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      );
    case "success":
      return <SuccessScreen amountLabel={amountLabel} />;
    case "running":
      return <RunningScreen amountLabel={amountLabel} steps={steps} activePhase={activePhase} />;
  }
}
