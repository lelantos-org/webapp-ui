// The frame every action screen is built in: header, card, Details row, CTA,
// and the three cards an op can end the card in.
//
// Layout only. Field state, the async op and toasts live elsewhere. The card
// shows one of four things —
//
//   * the form (fields, or the review that summarises them),
//   * `TxProgressCard` while the op is in flight,
//   * `TxSettledCard` once it has landed,
//   * `TxFailedCard` if it did not —
//
// which `useTxView` decides and `TxOutcome` draws (both in `TxOutcome.tsx`). What this owns is the frame
// around them, and that the fields survive all four. They are hidden rather than unmounted
// throughout, so react-hook-form keeps its state, "Try again" re-submits exactly
// what was entered, and a review's back returns to the form it summarised.

import { type ReactNode, useId, useRef } from "react";
import type { ProgressView } from "@/features/tx";
import { cx } from "@/shared/lib/cx";
import { type TxCopy, TxOutcome, type TxView, useTxView } from "./TxOutcome";
import "./ActionForm.css";

export interface ActionFormProps {
  /// Above the card: a `ScreenHeader`. Swapped by a form for its review step.
  header?: ReactNode;
  submitLabel: ReactNode;
  busy: boolean;
  error?: unknown;
  onSubmit(e: React.FormEvent): void;
  children: ReactNode;
  /// Form-level disable, such as an insufficient balance or missing context.
  /// `busy` already disables submit during an in-flight op.
  submitDisabled?: boolean;
  /// Why `submitDisabled` is set, in the user's terms, as a sentence.
  ///
  /// Shown under the CTA in place of `footnote`, and wired to the button with
  /// `aria-describedby`. A disabled button states a fact and withholds the
  /// reason; pass this wherever nothing else on screen already carries it.
  blockedReason?: string | undefined;
  /// The quiet line under an enabled CTA: "ETH is wrapped to WETH, then
  /// shielded." `blockedReason` takes its place while that is showing.
  footnote?: ReactNode;
  /// Between the fields and the CTA: the collapsed Details row (`FeeDetails`).
  /// Hidden with the fields while a review is open.
  details?: ReactNode;
  /// Below the card, outside it: a setup card, a page-level note. A function
  /// receives the card's current view, for content that describes the form and
  /// must step aside while the op runs or its outcome shows.
  after?: ReactNode | ((view: TxView) => ReactNode);
  /// The active op's steps. Drives the progress card.
  progress?: ProgressView;

  /// Last broadcast tx hash. An op with steps is only "in flight" after the
  /// mutation resolves if it has one, and the settled card is only shown with
  /// one — a form that tracks no hash keeps its fields.
  txHash?: string | undefined;
  /// The summary shown instead of the fields once the user has asked to send.
  ///
  /// When present the fields are hidden rather than unmounted — react-hook-form
  /// keeps its state either way, but hiding means going back is instant and the
  /// values cannot be re-validated into a different shape on the way.
  review?: ReactNode;
  tx?: TxCopy;
  /// Clears a finished op — `clearFinished` from `useActionForm`. Called when the
  /// user leaves a settled or failed card for the form. The card is dismissed
  /// either way; without this the stale progress is simply not shown.
  onReset?(): void;
}

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
        tx={tx}
        // `requestSubmit` runs the form's own submit path — validation, the
        // review gate, the submit-once guard — rather than calling the mutation
        // behind its back.
        onRetry={() => formRef.current?.requestSubmit()}
      />

      <div
        className="surface surface--card screen-card action-form__card"
        hidden={state.view !== "form"}
      >
        {/* Hidden, not unmounted: `back` has to return the user to exactly the
            form they left, and an unmount would re-run field registration. */}
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
                {busy ? "Submitting…" : submitLabel}
              </button>
              {/* Not while `busy`: mid-submit the button already says what it
                  is doing, and a stale reason underneath would contradict it. */}
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
