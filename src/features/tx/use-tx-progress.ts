// Progress state for one op: each mutation hook owns an instance and exposes it
// alongside the react-query result. The form reads `phase`, `steps` and `done`
// to drive `TxProgressCard`, and `failedAt` to say what a failure cost.

import { useCallback, useRef, useState } from "react";
import { recordProveDuration } from "./prove-eta";
import { isTerminal, type Step, type TxPhase, terminalOf } from "./tx-progress";

export interface TxProgress {
  /// Current phase, or `undefined` while idle or before the first call.
  phase: TxPhase | undefined;
  /// Ordered step list for the active op, set when the mutation starts.
  steps: Step[];
  /// A terminal phase has been reached. Set when `set` receives one — flushed,
  /// settled or failed — even if it is not in the step list, letting the form
  /// mark the last step done without admitting out-of-list ids into `phase`.
  done: boolean;
  /// The last in-list phase reached before `failed`, or `undefined` when the op
  /// has not failed or failed before any step began.
  ///
  /// Kept because `phase` becomes `failed` and forgets where it was, and where
  /// it was decides whether anything was spent: a deposit that fails at the
  /// wallet prompt moved nothing, one that fails after broadcast may still land.
  failedAt: TxPhase | undefined;
  /// The terminal phase the op ended on, including the out-of-list ones —
  /// `unknown` in particular, which settles the card without an observed outcome.
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

/// The slice of `TxProgressApi` a form reads: enough to render the stepper, plus
/// the `reset` that clears it. `set` and `start` stay with the mutation, so only
/// the op owning a stepper can advance it.
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
  // Read synchronously by `set`, which long-lived async callers — the SDK's
  // `onPhase`, the lifecycle tracker — capture once: the steps (bound at click
  // time `set` would see an empty list and drop every transition), the phase
  // that closes the stepper (`terminalOf`), the last in-list phase (`set("failed")`
  // records it in the same call, not from inside a setter's updater), and when
  // `proving` began, for the duration sample recorded when it ends.
  const live = useRef<{
    steps: Step[];
    terminal: TxPhase | undefined;
    phase: TxPhase | undefined;
    provingAt: number | undefined;
  }>({ steps: [], terminal: undefined, phase: undefined, provingAt: undefined });

  const set = useCallback((p: TxPhase) => {
    const l = live.current;
    const patch: Partial<TxProgress> = {};
    // Done when the configured terminal phase fires — the last step id for a
    // spend, `flushed` for a deposit — or when any global terminal phase does,
    // which covers out-of-list catch-up emissions.
    if (isTerminal(p) || p === l.terminal) {
      patch.done = true;
      patch.endedAs = p;
    }

    // A proof ends when the next phase arrives. Only a successful one — the
    // SDK moves on to `submitting` — is a sample of how long proving takes; a
    // failure mid-proof says nothing about it.
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
      // Phase transitions outside the active step list are dropped. The
      // lifecycle fires "settled" for any op with own commitments, including
      // deposits whose step list ends earlier; without this guard the stepper
      // would regress to all-pending when such a phase arrives.
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
