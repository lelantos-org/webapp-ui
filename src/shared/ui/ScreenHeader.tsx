import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeftGlyph } from "./icons/glyphs";
import "./ScreenHeader.css";

export interface ScreenHeaderProps {
  /// The screen's name, in sentence case: "Send privately", "Review".
  title: string;
  /// One line under the title.
  subtitle?: ReactNode;
  /// Trailing slot, for a step counter such as "STEP 2 OF 2".
  right?: ReactNode;
  /// Where the back button goes. Defaults to Home.
  backTo?: string;
  /// A handler instead of navigation; takes precedence over `backTo`.
  onBack?(): void;
  /// Accessible name for the back control, which is otherwise a bare chevron.
  backLabel?: string;
}

/// The head of every action screen: back control, the page's `h1`, one subtitle line.
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
