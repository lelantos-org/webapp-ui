import type { ReactNode } from "react";

export interface NoticeProps {
  title: string;
  children: ReactNode;
  /// Optional call to action rendered on the trailing edge.
  actionLabel?: string;
  onAction?(): void;
}

/// Inline prompt for something the surrounding form is blocked on. Announced
/// as a status so the reason reaches a screen reader when the submit button
/// disables.
export function Notice({ title, children, actionLabel, onAction }: NoticeProps) {
  return (
    <div className="notice" role="status">
      <div className="notice__body">
        <strong>{title}</strong>
        <span className="muted txt-xs">{children}</span>
      </div>
      {actionLabel && onAction ? (
        <button type="button" className="btn btn--ghost" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
