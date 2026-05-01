// Tiny progress-state hook: each mutation hook owns one and exposes it
// alongside the react-query result. The form reads `phase` + `steps` +
// `done` to drive the inline `<Stepper>`.

import { useCallback, useRef, useState } from "react";
import { isTerminal, type Step, type TxPhase } from "@/features/actions/tx-progress";

export interface StartOpts {
  /// Phase that closes out the stepper. Defaults to the last step's id
  /// (spend ops' last step IS the terminal). Deposits override with
  /// `flushed` so the `mined` phase advances the stepper without
  /// prematurely marking step 3 as done.
  terminal?: TxPhase;
}

export interface TxProgress {
  /// Current phase, or undefined when idle / before the first call.
  phase: TxPhase | undefined;
  /// Ordered step list for the active op (set when the mutation starts).
  steps: Step[];
  /// Terminal-phase reached. Set when set(p) receives a terminal phase
  /// (flushed/settled/failed) even if `p` isn't in the step list — lets
  /// the form mark the last step as done without leaking out-of-list ids
  /// into `phase`.
  done: boolean;
}

export interface TxProgressApi extends TxProgress {
  set(phase: TxPhase): void;
  start(steps: Step[], opts?: StartOpts): void;
  reset(): void;
}

export function useTxProgress(): TxProgressApi {
  const [phase, setPhase] = useState<TxPhase | undefined>(undefined);
  const [steps, setSteps] = useState<Step[]>([]);
  const [done, setDone] = useState(false);
  // Mirror steps in a ref so `set` (captured by long-lived async callers
  // like the SDK's onPhase or lifecycle tracker) always sees the latest
  // list. Without this, `set` is bound at click time when steps is still
  // [] and silently drops every transition.
  const stepsRef = useRef<Step[]>([]);
  // Phase that closes the stepper. Defaults to the last step id at
  // start-time. Deposits override with `flushed` so the `mined` phase
  // (which sits ON the last step) does not prematurely complete it.
  const terminalRef = useRef<TxPhase | undefined>(undefined);
  // Drop phase transitions that aren't in the active step list. Lifecycle
  // fires "settled" for any op with own commitments (incl. deposits whose
  // step list ends before settled); without this guard the Stepper would
  // regress to all-pending when an out-of-list phase arrives.
  const set = useCallback((p: TxPhase) => {
    const list = stepsRef.current;
    // Done when the configured terminal phase fires (spend ops use their
    // last step id; deposits use `flushed`), or any of the global
    // terminal phases (flushed/settled/failed) — the latter covers
    // out-of-list catch-up emissions.
    if (isTerminal(p) || p === terminalRef.current) setDone(true);
    setPhase((prev) => {
      if (p === "failed") return p;
      const inList = list.some((s) => s.id === p);
      return inList ? p : prev;
    });
  }, []);
  const start = useCallback((s: Step[], opts?: StartOpts) => {
    stepsRef.current = s;
    terminalRef.current = opts?.terminal ?? s[s.length - 1]?.id;
    setSteps(s);
    setPhase(undefined);
    setDone(false);
  }, []);
  const reset = useCallback(() => {
    stepsRef.current = [];
    terminalRef.current = undefined;
    setPhase(undefined);
    setSteps([]);
    setDone(false);
  }, []);
  return { phase, steps, done, set, start, reset };
}
