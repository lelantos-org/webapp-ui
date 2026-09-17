import type { ReactNode } from "react";
import { cx } from "@/shared/lib/cx";
import { InfoGlyph, WarnGlyph } from "./icons/glyphs";
import "./Notice.css";

/// What a box is telling you, which decides its colour: `warn`, `err`, `accent` (invitation), `neutral`.
export type NoticeTone = "accent" | "warn" | "err" | "neutral";

export interface NoticeProps {
  /// Defaults to `warn`.
  tone?: NoticeTone;
  /// Bold first line.
  title?: ReactNode;
  children?: ReactNode;
  /// Leading glyph; defaults per tone (none for `accent`). `false` draws nothing.
  icon?: ReactNode | false;
  /// A control of the caller's own — a link, or a button with its own handler.
  action?: ReactNode;
  /// Shorthand for an outline button in the notice's tone. Ignored when `action` is given.
  actionLabel?: string;
  onAction?(): void;
  /// `end` for the trailing edge, `below` under the text. Phones always stack it below.
  actionPlacement?: "end" | "below";
  /// Live-region role; `status` by default, `false` for static page content.
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

/// A tinted box with an optional glyph, title, body and action: every warning, setup and note box.
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
