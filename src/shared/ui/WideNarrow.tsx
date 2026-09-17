import type { ReactNode } from "react";

/// The same text at two lengths, switched by CSS so the first render is already right.
export function WideNarrow({ wide, narrow }: { wide: ReactNode; narrow: ReactNode }) {
  return (
    <>
      <span className="only-wide">{wide}</span>
      <span className="only-narrow">{narrow}</span>
    </>
  );
}
