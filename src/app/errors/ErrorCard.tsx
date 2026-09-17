import type { ReactNode } from "react";
import "./ErrorCard.css";

interface ErrorCardProps {
  title: string;
  children: ReactNode;
}

/// Card shown in place of a page that is unknown or failed to render.
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
