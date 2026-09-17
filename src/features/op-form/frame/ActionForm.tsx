import { type ReactNode, useId, useRef } from "react";
import type { ProgressView } from "@/features/tx";
import { cx } from "@/shared/lib/cx";
import type { TxOperation } from "@/shared/ui/tx-cards/TxSettledCard";
import { TxOutcome } from "./TxOutcome";
import { type TxCopy, type TxView, useTxView } from "./use-tx-view";
import "./ActionForm.css";

/// A submit button's label while its op is being sent.
export const SUBMITTING_LABEL = "Submitting…";

export interface ActionFormProps {
  /// Above the card: a `ScreenHeader`.
  header?: ReactNode;
  submitLabel: ReactNode;
  busy: boolean;
  error?: unknown;
  onSubmit(e: React.FormEvent): void;
  children: ReactNode;
  /// Form-level disable; `busy` already disables submit in flight.
  submitDisabled?: boolean;
  /// Why `submitDisabled` is set, shown under the CTA in place of `footnote`.
  blockedReason?: string | undefined;
  /// The quiet line under an enabled CTA.
  footnote?: ReactNode;
  /// Between the fields and the CTA: the collapsed Details row.
  details?: ReactNode;
  /// Below the card; a function receives the card's current view.
  after?: ReactNode | ((view: TxView) => ReactNode);
  progress?: ProgressView;
  /// Last broadcast tx hash; the settled card needs one.
  txHash?: string | undefined;
  /// This op's place in a bundled tx: `operationOf(m.data)`.
  operation?: TxOperation | undefined;
  /// The summary shown instead of the fields once the user asks to send.
  review?: ReactNode;
  tx?: TxCopy;
  /// Clears a finished op when the user leaves its outcome card.
  onReset?(): void;
}

/// The frame of every action screen: header, card, Details, CTA, and the op's outcome cards.
export function ActionForm({
  header,
  submitLabel,
  busy,
  error,
  onSubmit,
  children,
  submitDisabled = false,
  blockedReason,
  footnote,
  details,
  after,
  progress,
  txHash,
  operation,
  review,
  tx,
  onReset,
}: ActionFormProps) {
  const whyId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const state = useTxView({ busy, error, progress, txHash, liveAmount: tx?.amount, onReset });
  const showWhy = !!blockedReason && submitDisabled && !busy && !review;

  return (
    <form className="action-form" onSubmit={onSubmit} ref={formRef}>
      {header}

      <TxOutcome
        state={state}
        busy={busy}
        error={error}
        progress={progress}
        txHash={txHash}
        operation={operation}
        tx={tx}
        onRetry={() => formRef.current?.requestSubmit()}
      />

      <div
        className="surface surface--card screen-card action-form__card"
        hidden={state.view !== "form"}
      >
        {/* Hidden, not unmounted, so react-hook-form keeps the entry for back and retry. */}
        <div className="action-form__fields" hidden={!!review}>
          {children}
        </div>
        {review}
        {review ? null : (
          <>
            {details}
            <div
              className={cx("action-form__cta sticky-cta", (showWhy || !!footnote) && "has-note")}
            >
              <button
                className="btn btn--cta"
                type="submit"
                disabled={busy || submitDisabled}
                aria-describedby={showWhy ? whyId : undefined}
              >
                {busy ? SUBMITTING_LABEL : submitLabel}
              </button>
              {showWhy ? (
                <p className="action-form__why" id={whyId}>
                  {blockedReason}
                </p>
              ) : footnote ? (
                <p className="footnote">{footnote}</p>
              ) : null}
            </div>
          </>
        )}
      </div>

      {typeof after === "function" ? after(state.view) : after}
    </form>
  );
}
