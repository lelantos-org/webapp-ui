import type { ReactNode } from "react";
import { cx } from "@/shared/lib/cx";
import { InfoGlyph, WarnGlyph } from "./glyphs";
import "./Notice.css";

/// What a box is telling you, which decides its colour.
///
///   - `warn`    — a consequence to weigh before going on: the review's
///                 irreversibility note, the linkability warning, a fee shortfall.
///   - `err`     — something already wrong or about to be lost: the vault's
///                 eviction box.
///   - `accent`  — an invitation, not a problem: the one-time setup card.
///   - `neutral` — a fact worth knowing: the consolidation note under Max.
export type NoticeTone = "accent" | "warn" | "err" | "neutral";

export interface NoticeProps {
  /// Defaults to `warn`, the tone every notice had before tones existed.
  tone?: NoticeTone;
  /// Bold first line. Optional: the review's warning is a single sentence.
  title?: ReactNode;
  children?: ReactNode;
  /// Leading glyph. Defaults to a triangle for `warn`/`err` and an "i" for
  /// `neutral`; `accent` has none by default, since its design draws a tinted
  /// tile — pass `<span className="notice__tile">…</span>` for that. `false`
  /// draws nothing.
  icon?: ReactNode | false;
  /// A control of the caller's own — a link, or a button with its own handler.
  action?: ReactNode;
  /// Shorthand for the common case: an outline button in the notice's tone.
  /// Ignored when `action` is given.
  actionLabel?: string;
  onAction?(): void;
  /// `end` puts the action on the trailing edge (the setup card on desktop);
  /// `below` puts it under the text (the fee shortfall's "Pay the fee in ETH").
  /// Phones always stack it below.
  actionPlacement?: "end" | "below";
  /// The live-region role. `status` (the default) announces the notice when it
  /// appears, which is what a notice explaining a disabled submit needs; `alert`
  /// interrupts. Pass `false` for a notice that is part of the page's static
  /// content and should not announce itself.
  announce?: "status" | "alert" | false;
  className?: string;
}

function defaultIcon(tone: NoticeTone): ReactNode {
  switch (tone) {
    case "warn":
    case "err":
      return <WarnGlyph size={18} />;
    case "neutral":
      return <InfoGlyph size={17} />;
    case "accent":
      return null;
  }
}

/// A tinted box with an optional glyph, title, body and action — every warning,
/// setup and note box.
///
/// Announced as a status by default, so a reason reaches a screen reader when the
/// submit button it explains disables.
export function Notice({
  tone = "warn",
  title,
  children,
  icon,
  action,
  actionLabel,
  onAction,
  actionPlacement = "end",
  announce = "status",
  className,
}: NoticeProps) {
  const glyph = icon === false ? null : (icon ?? defaultIcon(tone));
  const control =
    action ??
    (actionLabel && onAction ? (
      <button
        type="button"
        className={cx("btn btn--outline", tone !== "neutral" && `btn--outline-${tone}`)}
        onClick={onAction}
      >
        {actionLabel}
      </button>
    ) : null);
  return (
    <div
      className={cx(
        "notice",
        `notice--${tone}`,
        !!control && `notice--action-${actionPlacement}`,
        className,
      )}
      role={announce || undefined}
    >
      {glyph ? <span className="notice__icon">{glyph}</span> : null}
      <div className="notice__body">
        {title ? <strong className="notice__t">{title}</strong> : null}
        {children ? <span className="notice__txt">{children}</span> : null}
        {control && actionPlacement === "below" ? (
          <span className="notice__action">{control}</span>
        ) : null}
      </div>
      {control && actionPlacement === "end" ? (
        <span className="notice__action">{control}</span>
      ) : null}
    </div>
  );
}
