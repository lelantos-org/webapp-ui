// Lets an element play a CSS exit animation before the parent unmounts it.

import { useCallback, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/shared/lib/motion";

export interface ExitTransition {
  /// True once the exit is playing. Drive the fade-out class from this.
  exiting: boolean;
  /// Start the exit; `done` runs once the animation has had its time. Calling
  /// it again while an exit is playing is a no-op, so a double dismiss cannot
  /// queue two callbacks.
  exit(done: () => void): void;
}

/**
 * A parent that renders `{open ? <Modal /> : null}` tears the subtree down on
 * the same frame the close callback fires, so an exit animation never gets to
 * run. This inverts the order: flip the class first, call back afterwards.
 *
 * A timer rather than `animationend`: that event bubbles, so any descendant's
 * own animation ends the exit early, and it never fires at all when reduced
 * motion disables the animation being waited on.
 *
 * @param durationMs must match the CSS animation it is pairing with.
 */
export function useExitTransition(durationMs: number): ExitTransition {
  const [exiting, setExiting] = useState(false);
  const started = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const exit = useCallback(
    (done: () => void) => {
      if (started.current) return;
      started.current = true;
      // No animation to wait for; a delay here would only make the close feel
      // unresponsive.
      if (prefersReducedMotion()) {
        done();
        return;
      }
      setExiting(true);
      timer.current = setTimeout(done, durationMs);
    },
    [durationMs],
  );

  return { exiting, exit };
}
