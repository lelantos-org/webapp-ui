// Animation timings live in `claim-success` CSS classes (styles.css);
// total ~950 ms.

import type { ReactNode } from "react";

interface SuccessCheckProps {
  /// Optional caption rendered under the tick.
  caption?: ReactNode;
}

export function SuccessCheck({ caption }: SuccessCheckProps) {
  return (
    <div className="claim-success" role="status" aria-live="polite">
      <svg className="claim-success__check" viewBox="0 0 52 52" role="img" aria-label="success">
        <title>success</title>
        <circle className="claim-success__circle" cx="26" cy="26" r="23" />
        <path className="claim-success__tick" d="M14 27 l8 8 l16 -18" />
      </svg>
      {caption ? <p className="modal-copy">{caption}</p> : null}
    </div>
  );
}
