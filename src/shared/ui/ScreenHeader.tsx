import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeftGlyph } from "./icons/glyphs";
import "./ScreenHeader.css";

export interface ScreenHeaderProps {
  /// Sentence case, e.g. "Send privately".
  title: string;
  subtitle?: ReactNode;
  /// Trailing slot, e.g. a step counter.
  right?: ReactNode;
  backTo?: string;
  /// Takes precedence over `backTo`.
  onBack?(): void;
  /// Accessible name for the back control, which has no text.
  backLabel?: string;
}

/// Action-screen header: back control, the page's `h1`, and a subtitle.
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
