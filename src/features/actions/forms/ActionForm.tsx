import type { ReactNode } from "react";
import { useTxExplorerUrl } from "@/features/chain";
import { friendlyMessage } from "@/shared/lib/errors";
import { Stepper } from "@/shared/ui/Stepper";
import { TxHash } from "@/shared/ui/TxHash";
import type { Step, TxPhase } from "../tx/tx-progress";

export interface ActionFormProps {
  /// Omit when the surrounding nav already names the op.
  title?: string;
  submitLabel: string;
  busy: boolean;
  error?: unknown;
  onSubmit(e: React.FormEvent): void;
  children: ReactNode;
  /// Form-level disable, such as an insufficient balance or missing context.
  /// `busy` already disables submit during an in-flight op.
  submitDisabled?: boolean;
  /// Optional inline stepper, rendered between the fields and the submit button
  /// when the active op publishes a non-empty step list.
  progress?: { steps: Step[]; phase: TxPhase | undefined; done: boolean };
  /// Last broadcast tx hash. Rendered as an explorer link below the stepper when
  /// present and no new submit is in flight.
  txHash?: string;
}

/// Layout only: field state, async lifecycle and toasts live elsewhere. The
/// inline error stays visible until the next submit, outliving the toast's
/// auto-dismiss.
export function ActionForm({
  title,
  submitLabel,
  busy,
  error,
  onSubmit,
  children,
  submitDisabled = false,
  progress,
  txHash,
}: ActionFormProps) {
  const explorerUrl = useTxExplorerUrl();
  const explorer = txHash ? explorerUrl(txHash) : undefined;
  const showTx = !!txHash && !busy;
  const showStepper = !!progress && progress.steps.length > 0;
  const failed = progress?.phase === "failed";
  // When the stepper is `done`, `current` is forced to the last step id so every
  // step is marked done. Otherwise `current` can still sit mid-list, having
  // received a terminal phase whose id is not in the step list.
  const lastStepId = progress?.steps[progress.steps.length - 1]?.id;
  const stepCurrent = progress?.done && lastStepId ? lastStepId : progress?.phase;
  const done = !!progress?.done && !failed;
  return (
    <form className="action-form" onSubmit={onSubmit}>
      {title ? (
        <div className="card__hdr">
          <h3 className="card__t">{title}</h3>
        </div>
      ) : null}
      <div className="stack stack--md">
        {children}
        {showStepper && progress ? (
          <Stepper steps={progress.steps} current={stepCurrent} failed={failed} done={done} />
        ) : null}
        {showTx && txHash ? <TxHash hash={txHash} url={explorer} /> : null}
        <button className="btn" type="submit" disabled={busy || submitDisabled}>
          {busy ? "submitting…" : submitLabel}
        </button>
        {/* Summary only. The cause is already logged by `toastError` in the
            mutation's `onError`, so reporting it again here would duplicate. */}
        {error ? <div className="err">{friendlyMessage(error)}</div> : null}
      </div>
    </form>
  );
}
