import { Link } from "react-router-dom";
import { useTxExplorerUrl } from "@/features/chain";
import {
  failureReassurance,
  type ProgressView,
  retrySafe,
  settledNote,
  useProveEta,
  walkAwayNote,
} from "@/features/tx";
import { userMessage } from "@/shared/lib/errors";
import { TxFailedCard } from "@/shared/ui/tx-cards/TxFailedCard";
import { TxProgressCard } from "@/shared/ui/tx-cards/TxProgressCard";
import { type TxOperation, TxSettledCard } from "@/shared/ui/tx-cards/TxSettledCard";
import type { TxCopy, TxViewState } from "./use-tx-view";

export interface TxOutcomeProps {
  state: TxViewState;
  busy: boolean;
  error: unknown;
  progress: ProgressView | undefined;
  txHash: string | undefined;
  operation?: TxOperation | undefined;
  tx: TxCopy | undefined;
  onRetry(): void;
}

/// The progress, settled or failed card an op's state calls for.
export function TxOutcome({
  state,
  busy,
  error,
  progress,
  txHash,
  operation,
  tx,
  onRetry,
}: TxOutcomeProps) {
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
          operation={operation}
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
  const lastStepId = progress?.steps[progress.steps.length - 1]?.id;
  const stepCurrent = progress?.done && lastStepId ? lastStepId : progress?.phase;
  return (
    <TxProgressCard
      title={tx?.progressTitle ?? "Working on it"}
      subtitle={subtitle}
      steps={progress?.steps ?? []}
      current={stepCurrent}
      done={!!progress?.done}
      note={state.hasSteps ? walkAwayNote(state.stage) : undefined}
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
