import { type ReactNode, useId } from "react";
import { grouped } from "@/shared/lib/address";
import { Notice } from "@/shared/ui/Notice";
import { SUBMITTING_LABEL } from "../frame/ActionForm";
import "./ReviewPanel.css";

export interface ReviewPanelProps {
  /// The amount as it will be sent, to at least two places: "250.00".
  figure: string;
  symbol: string;
  /// The same figure in words: "Two hundred fifty and 00/100 USDC". See
  /// `reviewFigure`, which writes both so they cannot disagree.
  words: string;
  /// "To this shielded address", "To this public address".
  destinationLabel: string;
  /// The raw address. Grouped here for reading.
  destination: string;
  /// The line under the address: what to check it against, or what making it
  /// public means.
  destinationNote: ReactNode;
  /// The itemised fees — `<FeeSummary variant="review" …/>`.
  fees: ReactNode;
  /// A section between the fees and the warning: the compact observer block.
  observer?: ReactNode;
  /// What cannot be undone. Shown in a warn box above the buttons.
  warning: ReactNode;
  confirmLabel: string;
  /// Why Confirm is held, as a sentence — "Working out the fee…". Confirm is
  /// disabled while this is set.
  confirmBlocked?: string | undefined;
  busy: boolean;
  onCancel(): void;
}

/// The review step between filling a spend in and sending it.
///
/// Sections rather than a re-rendered form: a review that looks like the thing
/// you just filled in gets skimmed. The amount is set large and again in words
/// because a decimal slip is the characteristic catastrophic error here, and the
/// destination is grouped in fours so it can actually be compared against
/// whatever the recipient sent.
///
/// Confirm is a real `submit`: the form's own handler sends on the second press,
/// with its validation and submit-once guard. Back leaves the fields untouched.
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
        {/* Not announced: the whole review takes the form's place, and the warning is
            part of what is being read, not an event on top of it. */}
        <Notice tone="warn" announce={false}>
          {warning}
        </Notice>
      </div>
      {/* A child of the review itself rather than of the section above: phones
          pin it to the viewport's bottom, and a sticky box cannot leave its
          parent, so inside the last section it would never pin at all. */}
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
