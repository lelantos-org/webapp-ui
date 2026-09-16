import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CrossGlyph } from "@/shared/ui/icons/glyphs";
import { TxHashRow } from "./TxHashRow";
import "./txcard.css";

export interface TxFailedCardProps {
  /// "Couldn't submit".
  title?: string | undefined;
  /// What went wrong, in the user's terms — `userMessage(error)`.
  message?: ReactNode;
  /// What the failure means for the user's funds.
  ///
  /// No default, deliberately. "Nothing was spent" is true before a proof is
  /// handed off and false after a deposit is broadcast or a Permit2 approval
  /// lands, and a card that cannot tell which stage it failed at must not guess.
  reassurance?: ReactNode;
  /// Re-submit the same form. The button is withheld without it.
  onRetry?: (() => void) | undefined;
  /// A third, quieter way out, such as returning to edit the form.
  secondary?: ReactNode;
  /// Set when the failure came after broadcast, so the transaction can be found.
  hash?: string | undefined;
  explorerUrl?: string | undefined;
}

/// The card an action ends on when it does not go through: what failed, what it
/// means, and the two ways forward.
export function TxFailedCard({
  title = "Couldn't submit",
  message,
  reassurance,
  onRetry,
  secondary,
  hash,
  explorerUrl,
}: TxFailedCardProps) {
  return (
    <section
      className="surface surface--card txcard txcard--failed"
      role="alert"
      aria-label={title}
    >
      <div className="txcard__head">
        <span className="glyph-ring txcard__ring txcard__ring--err" aria-hidden="true">
          <CrossGlyph size={20} />
        </span>
        <div className="txcard__heading">
          <span className="txcard__t txcard__t--sm">{title}</span>
          {message ? <span className="txcard__sub txcard__msg">{message}</span> : null}
        </div>
      </div>
      {reassurance ? <p className="txcard__sub txcard__p">{reassurance}</p> : null}
      {hash ? <TxHashRow hash={hash} explorerUrl={explorerUrl} /> : null}
      <div className="txcard__actions">
        {onRetry ? (
          <button type="button" className="btn btn--cta btn--sm" onClick={onRetry}>
            Try again
          </button>
        ) : null}
        <Link to="/" className="btn btn--outline btn--sm">
          Back home
        </Link>
      </div>
      {secondary ? <div className="txcard__secondary">{secondary}</div> : null}
    </section>
  );
}
