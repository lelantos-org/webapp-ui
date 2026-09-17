import type { ReactNode } from "react";
import "./SuccessCheck.css";

interface SuccessCheckProps {
  caption?: ReactNode;
}

/// The animated success tick, with an optional caption.
export function SuccessCheck({ caption }: SuccessCheckProps) {
  return (
    <div className="success-check" role="status" aria-live="polite">
      <svg className="success-check__check" viewBox="0 0 52 52" role="img" aria-label="success">
        <title>success</title>
        <circle className="success-check__circle" cx="26" cy="26" r="23" />
        <path className="success-check__tick" d="M14 27 l8 8 l16 -18" />
      </svg>
      {caption ? <p className="modal-copy">{caption}</p> : null}
    </div>
  );
}
