import type { ReactNode } from "react";
import "./ErrorCard.css";

interface ErrorCardProps {
  /// Sentence case, as the heading is painted and announced.
  title: string;
  /// The message and the way out, stacked under the heading.
  children: ReactNode;
}

/// The card a page shows in place of itself: an unknown route, or a render that
/// threw.
export function ErrorCard({ title, children }: ErrorCardProps) {
  return (
    <div className="card">
      <div className="card__hdr">
        <h2 className="card__t">{title}</h2>
      </div>
      <div className="stack">{children}</div>
    </div>
  );
}
