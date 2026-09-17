import { useCallback, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/shared/lib/motion";

export interface ExitTransition {
  /// True once the exit is playing. Drive the fade-out class from this.
  exiting: boolean;
  /// Start the exit; `done` runs once it has played. A repeat call is a no-op.
  exit(done: () => void): void;
}

/// Flip the exit class, then call back after `durationMs` (match the CSS animation).
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
