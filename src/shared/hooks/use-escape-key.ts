import { useEffect } from "react";

/// Run `onEscape` on Escape anywhere while set, stopping the event so lower surfaces stay open.
export function useEscapeKey(onEscape: (() => void) | undefined): void {
  useEffect(() => {
    if (!onEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEscape]);
}
