import type { ReactNode } from "react";

/// The same text at two lengths: `wide` wherever there is room, `narrow` on a
/// phone. Switched by CSS (`.only-wide` / `.only-narrow` in `styles/utilities.css`)
/// rather than a media-query hook, so the first render is already the right one.
export function WideNarrow({ wide, narrow }: { wide: ReactNode; narrow: ReactNode }) {
  return (
    <>
      <span className="only-wide">{wide}</span>
      <span className="only-narrow">{narrow}</span>
    </>
  );
}
