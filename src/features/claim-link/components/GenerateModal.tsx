// Modal portal for the generate-claim-link flow.

import { useId } from "react";
import { createPortal } from "react-dom";
import type { Step, TxPhase } from "@/features/actions/tx/tx-progress";
import { ConfirmScreen } from "@/features/claim-link/components/screens/ConfirmScreen";
import { RunningScreen } from "@/features/claim-link/components/screens/RunningScreen";
import { SuccessScreen } from "@/features/claim-link/components/screens/SuccessScreen";
import { cx } from "@/shared/lib/cx";

export type ModalScreen = "confirm" | "running" | "success";

const TITLES: Record<ModalScreen, string> = {
  confirm: "Confirm claim link",
  running: "Generating claim link",
  success: "Link ready",
};

export interface GenerateModalProps {
  screen: ModalScreen;
  amountLabel: string;
  /// Shown if `amountLabel` is empty (parse hasn't produced a labelled value yet).
  rawAmountInput: string;
  steps: Step[];
  activePhase: TxPhase | undefined;
  /// Applies fade-out animation; parent unmounts after the CSS transition completes.
  closing?: boolean;
  onCancel(): void;
  onConfirm(): void;
}

export function GenerateModal(props: GenerateModalProps) {
  const target = typeof document !== "undefined" ? document.body : null;
  if (!target) return null;
  return createPortal(<ModalShell {...props} />, target);
}

function ModalShell(props: GenerateModalProps) {
  const { screen, closing = false, onCancel } = props;
  const titleId = useId();
  const dismissable = screen === "confirm";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click + cancel button cover dismiss; running screen intentionally locked
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard equivalent is Escape, handled at the cancel button
    <div
      className={cx(
        "setup-overlay",
        !dismissable && "setup-overlay--locked",
        closing && "setup-overlay--fade-out",
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget && dismissable) onCancel();
      }}
    >
      <div
        className={cx(
          "setup-modal",
          screen === "running" && "setup-modal--running",
          closing && "setup-modal--fade-out",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="setup-title">
          {TITLES[screen]}
        </h2>
        <ScreenContent {...props} />
      </div>
    </div>
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
