import { isWalletError } from "@lelantos-org/sdk";
import { useEffect, useState } from "react";
import { opInFlight, type ProgressView, type TxStage } from "@/features/tx";

export interface TxCopy {
  progressTitle?: string;
  settledTitle?: string;
  failedTitle?: string;
  /// The amount being moved ("250 USDC"), latched at start since the form clears it on resolve.
  amount?: string | undefined;
}

export type TxView = "form" | "progress" | "settled" | "failed";

export interface TxViewInputs {
  busy: boolean;
  error?: unknown;
  progress?: ProgressView | undefined;
  txHash?: string | undefined;
  liveAmount?: string | undefined;
  onReset?: (() => void) | undefined;
}

export interface TxViewState {
  view: TxView;
  /// Where the op got to; the failing phase once it has failed.
  stage: TxStage;
  hasSteps: boolean;
  /// Live while the op runs, latched after.
  amount: string | undefined;
  /// The tx hash: the op's own, or the one a failure of unknown outcome carries.
  hash: string | undefined;
  leave(): void;
}

function txView({ busy, error, progress, txHash }: TxViewInputs): TxView {
  const phaseFailed = progress?.phase === "failed";
  if (isInFlight(busy, progress, txHash)) return "progress";
  if (phaseFailed || error) return "failed";
  return progress?.done && txHash ? "settled" : "form";
}

function isInFlight(
  busy: boolean,
  progress: ProgressView | undefined,
  txHash: string | undefined,
): boolean {
  return opInFlight({
    running: busy,
    sent: !!txHash,
    steps: progress?.steps ?? [],
    done: !!progress?.done,
    phase: progress?.phase,
  });
}

/// Decides which card an op shows and latches the amount it states.
export function useTxView(inputs: TxViewInputs): TxViewState {
  const { busy, error, progress, txHash, liveAmount, onReset } = inputs;
  const hasSteps = !!progress && progress.steps.length > 0;
  const phaseFailed = progress?.phase === "failed";
  // Cleared by the next submit, so a fresh op always shows its own outcome.
  const [dismissed, setDismissed] = useState(false);
  if (busy && dismissed) setDismissed(false);

  const [latchedAmount, setLatchedAmount] = useState<string | undefined>(undefined);
  if (busy && liveAmount && liveAmount !== latchedAmount) setLatchedAmount(liveAmount);
  // Kept with the op too: a form that remounts mid-op has no fields left to read it from.
  const noteAmount = progress?.noteAmount;
  const noted = progress?.amount;
  useEffect(() => {
    if (busy && liveAmount && liveAmount !== noted) noteAmount?.(liveAmount);
  }, [busy, liveAmount, noted, noteAmount]);
  const amount = (busy ? liveAmount : undefined) || latchedAmount || noted;

  const view = dismissed && !isInFlight(busy, progress, txHash) ? "form" : txView(inputs);

  const unknown = isWalletError(error, "SPEND_OUTCOME_UNKNOWN") ? error : undefined;
  const hash = txHash ?? unknown?.txHash;
  const stage: TxStage = {
    steps: progress?.steps ?? [],
    phase: phaseFailed ? progress?.failedAt : progress?.phase,
    hash: !!hash,
    outcomeUnknown: !!unknown,
  };

  const leave = () => {
    setDismissed(true);
    onReset?.();
  };

  return { view, stage, hasSteps, amount, hash, leave };
}
