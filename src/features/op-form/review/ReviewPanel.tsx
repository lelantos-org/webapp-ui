import { type ReactNode, useId } from "react";
import { grouped } from "@/shared/lib/address";
import { Notice } from "@/shared/ui/Notice";
import { SUBMITTING_LABEL } from "../frame/ActionForm";
import "./ReviewPanel.css";

export interface ReviewPanelProps {
  /// The amount as it will be sent: "250.00".
  figure: string;
  symbol: string;
  /// The same figure in words, from `reviewFigure`.
  words: string;
  destinationLabel: string;
  /// The raw address; grouped here for reading.
  destination: string;
  destinationNote: ReactNode;
  fees: ReactNode;
  /// Between the fees and the warning: the compact observer block.
  observer?: ReactNode;
  /// What cannot be undone.
  warning: ReactNode;
  confirmLabel: string;
  /// Why Confirm is held; Confirm is disabled while set.
  confirmBlocked?: string | undefined;
  busy: boolean;
  onCancel(): void;
}

/// The review step of a spend: amount in figures and words, grouped destination, fees, warning, Confirm.
export function ReviewPanel({
  figure,
  symbol,
  words,
  destinationLabel,
  destination,
  destinationNote,
  fees,
  observer,
  warning,
  confirmLabel,
  confirmBlocked,
  busy,
  onCancel,
}: ReviewPanelProps) {
  const whyId = useId();
  const showWhy = !!confirmBlocked && !busy;
  return (
    <div className="spend-review">
      <section className="spend-review__sec spend-review__sec--lead" aria-label="Amount">
        <div className="caps spend-review__cap">You are sending</div>
        <div className="figure spend-review__amt">
          {figure} <span className="spend-review__sym">{symbol}</span>
        </div>
        <div className="cheque spend-review__words">
          <span className="cheque__txt spend-review__words-txt">{words}</span>
          <span className="cheque__rule" aria-hidden="true" />
        </div>
      </section>

      <section className="spend-review__sec" aria-label="Destination">
        <div className="caps spend-review__cap">{destinationLabel}</div>
        <div className="spend-review__addr mono">{grouped(destination)}</div>
        <p className="spend-review__note">{destinationNote}</p>
      </section>

      <section className="spend-review__sec" aria-label="Fees">
        {fees}
      </section>

      {observer ? <section className="spend-review__sec">{observer}</section> : null}

      <div className="spend-review__sec spend-review__end">
        <Notice tone="warn" announce={false}>
          {warning}
        </Notice>
      </div>
      {/* Outside the last section: a sticky box cannot leave its parent, and phones pin this. */}
      <div className="spend-review__cta sticky-cta">
        <div className="spend-review__actions">
          <button className="btn btn--outline" type="button" onClick={onCancel} disabled={busy}>
            Back
          </button>
          <button
            className="btn btn--cta spend-review__confirm"
            type="submit"
            disabled={busy || !!confirmBlocked}
            aria-describedby={showWhy ? whyId : undefined}
          >
            {busy ? SUBMITTING_LABEL : confirmLabel}
          </button>
        </div>
        {showWhy ? (
          <p className="action-form__why spend-review__why" id={whyId}>
            {confirmBlocked}
          </p>
        ) : null}
      </div>
    </div>
  );
}
