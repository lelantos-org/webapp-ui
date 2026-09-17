import { useCallback, useRef, useState } from "react";
import { recordProveDuration } from "./prove-eta";
import { isTerminal, type Step, type TxPhase, terminalOf } from "./tx-progress";

export interface TxProgress {
  /// Current phase, or `undefined` while idle or before the first call.
  phase: TxPhase | undefined;
  /// Ordered step list for the active op, set when the mutation starts.
  steps: Step[];
  /// A terminal phase has been reached, including ones outside the step list.
  done: boolean;
  /// The last in-list phase before `failed`; it decides whether anything may have been spent.
  failedAt: TxPhase | undefined;
  /// The terminal phase the op ended on, including out-of-list ones such as `unknown`.
  endedAs: TxPhase | undefined;
  /// When the current proof began (`Date.now()`), while `phase` is `proving`.
  provingSince: number | undefined;
}

export interface TxProgressApi extends TxProgress {
  set(phase: TxPhase): void;
  /// Begin an op. Its terminal phase is `terminalOf(steps)`.
  start(steps: Step[]): void;
  reset(): void;
}

/// The slice of `TxProgressApi` a form reads; only the op's mutation can advance it.
export type ProgressView = Omit<TxProgressApi, "set" | "start">;

const IDLE: TxProgress = {
  phase: undefined,
  steps: [],
  done: false,
  failedAt: undefined,
  endedAs: undefined,
  provingSince: undefined,
};

export function useTxProgress(): TxProgressApi {
  const [state, setState] = useState<TxProgress>(IDLE);
  // Read synchronously by `set`, which long-lived async callers capture once.
  const live = useRef<{
    steps: Step[];
    terminal: TxPhase | undefined;
    phase: TxPhase | undefined;
    provingAt: number | undefined;
  }>({ steps: [], terminal: undefined, phase: undefined, provingAt: undefined });

  const set = useCallback((p: TxPhase) => {
    const l = live.current;
    const patch: Partial<TxProgress> = {};
    if (isTerminal(p) || p === l.terminal) {
      patch.done = true;
      patch.endedAs = p;
    }

    if (l.provingAt !== undefined && p !== "proving") {
      if (p === "submitting") recordProveDuration(Date.now() - l.provingAt);
      l.provingAt = undefined;
      patch.provingSince = undefined;
    }
    if (p === "proving" && l.provingAt === undefined) {
      l.provingAt = Date.now();
      patch.provingSince = l.provingAt;
    }

    if (p === "failed") {
      patch.failedAt = l.phase;
      patch.phase = p;
    } else if (l.steps.some((s) => s.id === p)) {
      // Out-of-list phases are dropped, or a late `settled` would regress the stepper.
      l.phase = p;
      patch.phase = p;
    }
    if (Object.keys(patch).length > 0) setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const start = useCallback((steps: Step[]) => {
    live.current = { steps, terminal: terminalOf(steps), phase: undefined, provingAt: undefined };
    setState({ ...IDLE, steps });
  }, []);
  const reset = useCallback(() => start([]), [start]);

  return { ...state, set, start, reset };
}
