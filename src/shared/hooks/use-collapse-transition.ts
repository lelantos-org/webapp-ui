import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/shared/lib/motion";

export interface CollapseTransition {
  /// Keep rendering; outlives `open` by the collapse duration.
  mounted: boolean;
  /// Drives the open class; lags `open` by a frame so there is a state to transition from.
  expanded: boolean;
}

/// Keep an element mounted while it collapses. `durationMs` must match the CSS transition.
export function useCollapseTransition(open: boolean, durationMs: number): CollapseTransition {
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => setExpanded(true));
      return () => cancelAnimationFrame(frame);
    }
    setExpanded(false);
    if (prefersReducedMotion()) {
      setMounted(false);
      return;
    }
    const timer = setTimeout(() => setMounted(false), durationMs);
    return () => clearTimeout(timer);
  }, [open, durationMs]);

  return { mounted, expanded };
}
