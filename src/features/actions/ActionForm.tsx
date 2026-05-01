import type { ReactNode } from "react";
import type { Step, TxPhase } from "@/features/actions/tx-progress";
import { friendlyMessage } from "@/shared/lib/errors";
import { txExplorerUrl } from "@/shared/lib/toast";
import { Stepper } from "@/shared/ui/Stepper";

export interface ActionFormProps {
  /// Omit when the surrounding nav already names the op.
  title?: string;
  submitLabel: string;
  busy: boolean;
  error?: unknown;
  onSubmit(e: React.FormEvent): void;
  children: ReactNode;
  /// Form-level disable (insufficient balance, missing context, etc).
  /// `busy` already disables submit during in-flight ops.
  submitDisabled?: boolean;
  /// Optional inline stepper. Rendered between fields and submit button
  /// when the active op publishes a non-empty step list.
  progress?: { steps: Step[]; phase: TxPhase | undefined; done: boolean };
  /// Last broadcast tx hash. Rendered as an explorer link below the stepper
  /// when present and no new submit is in flight.
  txHash?: string;
}

/// Pure layout — field state, async lifecycle, and toasts live elsewhere.
/// Inline error stays visible until the next submit, outliving the toast
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
  const explorer = txHash ? txExplorerUrl(txHash) : undefined;
  const showTx = !!txHash && !busy;
  const showStepper = !!progress && progress.steps.length > 0;
  const failed = progress?.phase === "failed";
  // When stepper is `done`, force `current` to the last step id so the
  // Stepper marks every step as done. Otherwise `current` may still be
  // mid-list when a terminal phase (flushed/settled) arrived but its id
  // wasn't in the step list.
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
        {showTx && txHash ? (
          <div className="txt-xs muted">
            tx{" "}
            {explorer ? (
              <a
                href={explorer}
                target="_blank"
                rel="noopener noreferrer"
                className="mono lnk"
                style={{ wordBreak: "break-all" }}
              >
                {txHash}
              </a>
            ) : (
              <span className="mono" style={{ wordBreak: "break-all" }}>
                {txHash}
              </span>
            )}
          </div>
        ) : null}
        <button className="btn" type="submit" disabled={busy || submitDisabled}>
          {busy ? "submitting…" : submitLabel}
        </button>
        {error ? <div className="err">{friendlyMessage(error)}</div> : null}
      </div>
    </form>
  );
}
