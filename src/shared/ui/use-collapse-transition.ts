// Lets an element play a CSS height collapse when a prop says it is gone.
//
// The sibling of `useExitTransition`, and the difference is who decides. That
// one is for a caller holding a close *callback*: it flips a class, waits, and
// calls back. This one is for a caller holding an open *prop* it does not
// control — the content simply disappears, and the element still has to be
// rendered for long enough to animate away.

import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/shared/lib/motion";

export interface CollapseTransition {
  /// Keep rendering. Outlives `open` by the collapse, so there is something
  /// left to animate away.
  mounted: boolean;
  /// Drive the open class from this. Lags `open` by a frame on the way in, so
  /// the element has a closed state to transition *from* — an element that
  /// mounts already-open has nothing to interpolate and simply appears.
  expanded: boolean;
}

/**
 * @param durationMs must match the CSS transition it is pairing with.
 */
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
    // Nothing to wait out — holding the node would only delay its removal.
    if (prefersReducedMotion()) {
      setMounted(false);
      return;
    }
    const timer = setTimeout(() => setMounted(false), durationMs);
    return () => clearTimeout(timer);
  }, [open, durationMs]);

  return { mounted, expanded };
}
