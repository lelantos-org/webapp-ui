import type { ReactNode } from "react";

/// Text at two lengths, switched by CSS so the first render is correct.
export function WideNarrow({ wide, narrow }: { wide: ReactNode; narrow: ReactNode }) {
  return (
    <>
      <span className="only-wide">{wide}</span>
      <span className="only-narrow">{narrow}</span>
    </>
  );
}
