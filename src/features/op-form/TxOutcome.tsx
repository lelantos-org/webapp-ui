// Which of four things an op's card shows, and the state that decides it.
//
// The form, `TxProgressCard` while the op is in flight, `TxSettledCard` once it
// has landed, `TxFailedCard` if it did not. Apart from `ActionForm`, which draws
// them, so a form that must know the same thing — Shield withholds its setup
// card while an op runs — reads it rather than re-deriving it with a formula
// that can drift.
//
// `useTxView` decides; `TxOutcome` draws the three cards an op can end in.

import { useState } from "react";
import { Link } from "react-router-dom";
import { useTxExplorerUrl } from "@/features/chain";
import {
  failureReassurance,
  type ProgressView,
  retrySafe,
  settledNote,
  type TxStage,
  useProveEta,
  walkAwayNote,
} from "@/features/tx";
import { userMessage } from "@/shared/lib/errors";
import { capitalizeFirst } from "@/shared/lib/text";
import { TxFailedCard } from "@/shared/ui/TxFailedCard";
import { TxProgressCard } from "@/shared/ui/TxProgressCard";
import { TxSettledCard } from "@/shared/ui/TxSettledCard";

/// How the op names itself on the progress, settled and failed cards. Every field
/// has a neutral default, so a form that passes nothing still gets the cards.
export interface TxCopy {
  /// In-flight title: "Proving your transfer". Default "Working on it".
  progressTitle?: string;
  /// Settled title: "Sent privately". Default "Done".
  settledTitle?: string;
  /// Failed title. Default "Couldn't submit".
  failedTitle?: string;
  /// The amount being moved, as the live form states it ("250 USDC").
  ///
  /// Latched when the op starts, because the forms clear their amount the moment
  /// the op resolves — which is before the settled card is shown.
  amount?: string | undefined;
}

export type TxView = "form" | "progress" | "settled" | "failed";

export interface TxViewInputs {
  busy: boolean;
  error?: unknown;
  progress?: ProgressView | undefined;
  txHash?: string | undefined;
  /// The amount as the live form states it; see `TxCopy.amount`.
  liveAmount?: string | undefined;
  /// Clears a finished op when the user leaves its card.
  onReset?: (() => void) | undefined;
}

export interface TxViewState {
  view: TxView;
  /// Where the op got to — the failing phase once it has failed — for the lines
  /// that depend on it: whether the tab may be closed, what a failure cost, and
  /// whether a retry could repeat something already on-chain.
  stage: TxStage;
  hasSteps: boolean;
  /// The amount the cards state: live while the op runs, latched after.
  amount: string | undefined;
  /// Leave a settled or failed card for the form.
  leave(): void;
}

/// Which card an op's state calls for, before the user has dismissed any.
export function txView({ busy, error, progress, txHash }: TxViewInputs): TxView {
  const phaseFailed = progress?.phase === "failed";
  if (isInFlight(busy, progress, txHash)) return "progress";
  if (phaseFailed || error) return "failed";
  return progress?.done && txHash ? "settled" : "form";
}

/// In flight: the mutation is running, or it has resolved at broadcast and the
/// tracker is still walking the steps to the terminal phase.
function isInFlight(
  busy: boolean,
  progress: ProgressView | undefined,
  txHash: string | undefined,
): boolean {
  const hasSteps = !!progress && progress.steps.length > 0;
  return busy || (hasSteps && !progress.done && progress.phase !== "failed" && !!txHash);
}

export function useTxView(inputs: TxViewInputs): TxViewState {
  const { busy, progress, txHash, liveAmount, onReset } = inputs;
  const hasSteps = !!progress && progress.steps.length > 0;
  const phaseFailed = progress?.phase === "failed";
  // Leaving a settled or failed card for the form. Cleared by the next submit,
  // so a fresh op always shows its own outcome. Adjusted during render rather
  // than in an effect, so no commit shows a stale dismissal.
  const [dismissed, setDismissed] = useState(false);
  if (busy && dismissed) setDismissed(false);

  // Latched: see `TxCopy.amount`.
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

export interface TxOutcomeProps {
  state: TxViewState;
  busy: boolean;
  error: unknown;
  progress: ProgressView | undefined;
  txHash: string | undefined;
  tx: TxCopy | undefined;
  /// Re-run the form's own submit, for "Try again".
  onRetry(): void;
}

export function TxOutcome({ state, busy, error, progress, txHash, tx, onRetry }: TxOutcomeProps) {
  const { view, amount } = state;
  const explorerUrl = useTxExplorerUrl();
  const explorer = txHash ? explorerUrl(txHash) : undefined;
  const eta = useProveEta(view === "progress" ? progress?.provingSince : undefined);

  switch (view) {
    case "progress":
      return (
        <ProgressOutcome
          state={state}
          busy={busy}
          progress={progress}
          tx={tx}
          subtitle={[amount, eta].filter(Boolean).join(" · ") || undefined}
        />
      );
    case "settled":
      return (
        <TxSettledCard
          title={tx?.settledTitle ?? "Done"}
          amount={amount}
          hash={txHash}
          explorerUrl={explorer}
          note={settledNote(progress?.endedAs)}
          action={
            <button type="button" className="btn btn--outline btn--sm" onClick={state.leave}>
              Done
            </button>
          }
        />
      );
    case "failed":
      return (
        <TxFailedCard
          title={tx?.failedTitle}
          message={error ? userMessage(error) : "The transaction didn't go through."}
          reassurance={state.hasSteps ? failureReassurance(state.stage) : undefined}
          // Withheld once the op may be on-chain, where a retry could repeat it.
          onRetry={!state.hasSteps || retrySafe(state.stage) ? onRetry : undefined}
          hash={txHash}
          explorerUrl={explorer}
          secondary={
            <button
              type="button"
              className="link-btn txcard__link txcard__link--quiet"
              onClick={state.leave}
            >
              Edit the details
            </button>
          }
        />
      );
    default:
      return null;
  }
}

function ProgressOutcome({
  state,
  busy,
  progress,
  tx,
  subtitle,
}: Pick<TxOutcomeProps, "state" | "busy" | "progress" | "tx"> & { subtitle: string | undefined }) {
  // The last step is forced current once `done`, so every step reads complete
  // even when the terminal phase is not itself in the list.
  const lastStepId = progress?.steps[progress.steps.length - 1]?.id;
  const stepCurrent = progress?.done && lastStepId ? lastStepId : progress?.phase;
  return (
    <TxProgressCard
      title={tx?.progressTitle ?? "Working on it"}
      subtitle={subtitle}
      steps={(progress?.steps ?? []).map((s) => ({
        id: s.id,
        // Sentence case for the step labels `tx-progress.ts` writes in lowercase.
        label: capitalizeFirst(s.label),
        activeLabel: s.activeLabel,
        doneLabel: s.doneLabel,
        detail: s.detail,
      }))}
      current={stepCurrent}
      done={!!progress?.done}
      note={state.hasSteps ? walkAwayNote(state.stage) : undefined}
      // Once the mutation has resolved the op is out of this tab's hands —
      // broadcast, and tracked by the lifecycle toasts — so leaving is safe.
      action={
        busy ? undefined : (
          <Link to="/" className="link-btn txcard__link">
            Back home
          </Link>
        )
      }
    />
  );
}
