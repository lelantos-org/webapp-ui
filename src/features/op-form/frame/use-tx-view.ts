import { useState } from "react";
import type { ProgressView, TxStage } from "@/features/tx";

/// How the op names itself on the progress, settled and failed cards.
export interface TxCopy {
  progressTitle?: string;
  settledTitle?: string;
  failedTitle?: string;
  /// The amount being moved ("250 USDC"), latched at start since the form clears it on resolve.
  amount?: string | undefined;
}

/// Which card an op's action form shows.
export type TxView = "form" | "progress" | "settled" | "failed";

/// What `useTxView` reads.
export interface TxViewInputs {
  busy: boolean;
  error?: unknown;
  progress?: ProgressView | undefined;
  txHash?: string | undefined;
  liveAmount?: string | undefined;
  onReset?: (() => void) | undefined;
}

/// The card to show and what it states.
export interface TxViewState {
  view: TxView;
  /// Where the op got to; the failing phase once it has failed.
  stage: TxStage;
  hasSteps: boolean;
  /// Live while the op runs, latched after.
  amount: string | undefined;
  leave(): void;
}

function txView({ busy, error, progress, txHash }: TxViewInputs): TxView {
  const phaseFailed = progress?.phase === "failed";
  if (isInFlight(busy, progress, txHash)) return "progress";
  if (phaseFailed || error) return "failed";
  return progress?.done && txHash ? "settled" : "form";
}

/// Mutating, or resolved at broadcast with the tracker still walking the steps.
function isInFlight(
  busy: boolean,
  progress: ProgressView | undefined,
  txHash: string | undefined,
): boolean {
  const hasSteps = !!progress && progress.steps.length > 0;
  return busy || (hasSteps && !progress.done && progress.phase !== "failed" && !!txHash);
}

/// Decides which card an op shows and latches the amount it states.
export function useTxView(inputs: TxViewInputs): TxViewState {
  const { busy, progress, txHash, liveAmount, onReset } = inputs;
  const hasSteps = !!progress && progress.steps.length > 0;
  const phaseFailed = progress?.phase === "failed";
  // Cleared by the next submit, so a fresh op always shows its own outcome.
  const [dismissed, setDismissed] = useState(false);
  if (busy && dismissed) setDismissed(false);

  const [latchedAmount, setLatchedAmount] = useState<string | undefined>(undefined);
  if (busy && liveAmount && liveAmount !== latchedAmount) setLatchedAmount(liveAmount);
  const amount = (busy ? liveAmount : undefined) || latchedAmount;

  const view = dismissed && !isInFlight(busy, progress, txHash) ? "form" : txView(inputs);

  const stage: TxStage = {
    steps: progress?.steps ?? [],
    phase: phaseFailed ? progress?.failedAt : progress?.phase,
    hash: !!txHash,
  };

  const leave = () => {
    setDismissed(true);
    onReset?.();
  };

  return { view, stage, hasSteps, amount, leave };
}
