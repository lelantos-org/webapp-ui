import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cx } from "@/shared/lib/cx";

/// A wait with nothing to show yet.
export function ProfileWait({ title }: { title: string }) {
  return (
    <section className="surface surface--card profile-card" aria-busy="true">
      <div className="profile-wait" role="status">
        <span className="spinner" aria-hidden="true" />
        <span className="profile-card__t">{title}</span>
      </div>
      <div className="skel skel--row" aria-hidden="true" />
    </section>
  );
}

export interface ProfileStatusProps {
  title: string;
  children: ReactNode;
  /// `err` for a name that must not be paid or was refused; `warn` for one with nothing to pay.
  tone: "warn" | "err";
  /// Re-runs the read that failed.
  onRetry?: (() => void) | undefined;
  /// An in-app way on, in place of the link home.
  action?: ReactNode;
}

/// A profile with nothing to pay: says why, and offers the way on.
export function ProfileStatus({ title, children, tone, onRetry, action }: ProfileStatusProps) {
  return (
    <section
      className={cx("surface surface--card profile-card", `profile-card--${tone}`)}
      role={tone === "err" ? "alert" : "status"}
    >
      <h2 className="profile-card__t">{title}</h2>
      <p className="profile-card__p">{children}</p>
      <div className="profile-card__actions">
        {onRetry ? (
          <button type="button" className="btn btn--cta btn--sm" onClick={onRetry}>
            Try again
          </button>
        ) : null}
        {action ?? (
          <Link to="/" className="btn btn--outline btn--sm">
            Go to the wallet
          </Link>
        )}
      </div>
    </section>
  );
}
