import type { ReactNode } from "react";
import { cx } from "@/shared/lib/cx";
import { InfoGlyph, WarnGlyph } from "./icons/glyphs";
import "./Notice.css";

/// Sets the box colour. `accent` is an invitation to act.
export type NoticeTone = "accent" | "warn" | "err" | "neutral";

export interface NoticeProps {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  /// Leading glyph; defaults per tone (none for `accent`). `false` draws nothing.
  icon?: ReactNode | false;
  /// Caller-supplied control, e.g. a link.
  action?: ReactNode;
  /// With `onAction`, renders an outline button in the tone. Ignored when `action` is given.
  actionLabel?: string;
  onAction?(): void;
  /// `end` is the trailing edge, `below` under the text. Narrow viewports always stack it below.
  actionPlacement?: "end" | "below";
  /// Live-region role. `false` for static page content.
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

/// Tinted box with an optional glyph, title, body and action.
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
