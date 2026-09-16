import { useEffect } from "react";

/// Run `onEscape` when Escape is pressed anywhere on the page, while it is set.
/// Stops the event there, so a surface under this one does not also close.
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
