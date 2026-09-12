import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeftGlyph } from "./glyphs";
import "./ScreenHeader.css";

export interface ScreenHeaderProps {
  /// The screen's name, in sentence case: "Send privately", "Review".
  title: string;
  /// One line under the title: a `BoundaryLine`, or plain text such as the
  /// review's "Shielded pool → shielded address · stays off-chain".
  subtitle?: ReactNode;
  /// Trailing slot, for a step counter such as "STEP 2 OF 2".
  right?: ReactNode;
  /// Where the back button goes. Defaults to Home.
  backTo?: string;
  /// Replaces navigation with a handler, for a back that stays on the route —
  /// the review's back returns to the form it summarises. Takes precedence
  /// over `backTo`.
  onBack?(): void;
  /// Accessible name for the back control, which is otherwise a bare chevron.
  backLabel?: string;
}

/// The head of every action screen: a back button, the title, one subtitle line.
///
/// The title is the page's `h1`. Each action is its own route, so the screen
/// name is the document's name — Home keeps its own visually hidden one.
///
/// The back control is a link when it navigates and a button when it does not,
/// so it announces as what it does. Its box is 40px (38 on phones),
/// with the hit area extended to 44 by `.screen-hdr__back::after`.
export function ScreenHeader({
  title,
  subtitle,
  right,
  backTo = "/",
  onBack,
  backLabel = "Back",
}: ScreenHeaderProps) {
  const glyph = <ChevronLeftGlyph size={18} />;
  return (
    <div className="screen-hdr">
      {onBack ? (
        <button
          type="button"
          className="icon-btn screen-hdr__back"
          onClick={onBack}
          aria-label={backLabel}
        >
          {glyph}
        </button>
      ) : (
        <Link to={backTo} className="icon-btn screen-hdr__back" aria-label={backLabel}>
          {glyph}
        </Link>
      )}
      <div className="screen-hdr__text">
        <h1 className="screen-hdr__t">{title}</h1>
        {subtitle ? <div className="screen-hdr__sub">{subtitle}</div> : null}
      </div>
      {right ? <span className="screen-hdr__right">{right}</span> : null}
    </div>
  );
}
