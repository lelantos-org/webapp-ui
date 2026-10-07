import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export interface NameUnavailableProps {
  /// Above the card: the screen's header.
  header: ReactNode;
  reason: string;
  advice?: string | undefined;
}

/// Shown in place of the form where a handle cannot be claimed.
export function NameUnavailable({ header, reason, advice }: NameUnavailableProps) {
  return (
    <>
      {header}
      <section className="surface surface--card screen-card name-off" aria-labelledby="name-off-t">
        <h2 className="name-off__t" id="name-off-t">
          Handles unavailable
        </h2>
        <p className="name-off__p">{reason}</p>
        {advice ? <p className="name-off__p name-off__p--mute">{advice}</p> : null}
        <Link to="/" className="btn btn--outline">
          Back home
        </Link>
      </section>
    </>
  );
}
