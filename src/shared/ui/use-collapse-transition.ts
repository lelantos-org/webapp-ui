// Lets an element play a CSS height collapse when a prop says it is gone.
//
// The counterpart of `useExitTransition`, differing in who decides. That one
// serves a caller holding a close callback: it flips a class, waits, then calls
// back. This one serves a caller holding an open prop it does not control, where
// the content disappears and the element must stay rendered long enough to
// animate away.

import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/shared/lib/motion";

export interface CollapseTransition {
  /// Keep rendering. Outlives `open` by the collapse duration, so there is
  /// something left to animate away.
  mounted: boolean;
  /// Drives the open class. Lags `open` by a frame on the way in, so the element
  /// has a closed state to transition from; one that mounts already open has
  /// nothing to interpolate.
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
    // Nothing to wait out; holding the node would only delay its removal.
    if (prefersReducedMotion()) {
      setMounted(false);
      return;
    }
    const timer = setTimeout(() => setMounted(false), durationMs);
    return () => clearTimeout(timer);
  }, [open, durationMs]);

  return { mounted, expanded };
}
