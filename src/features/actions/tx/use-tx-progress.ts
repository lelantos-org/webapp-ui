// Progress state for one op: each mutation hook owns an instance and exposes it
// alongside the react-query result. The form reads `phase`, `steps` and `done`
// to drive the inline `<Stepper>`.

import { useCallback, useRef, useState } from "react";
import { isTerminal, type Step, type TxPhase } from "./tx-progress";

export interface StartOpts {
  /// Phase that closes out the stepper. Defaults to the last step's id, which is
  /// the terminal for a spend. Deposits override with `flushed`, so the `mined`
  /// phase advances the stepper without marking the last step done.
  terminal?: TxPhase;
}

export interface TxProgress {
  /// Current phase, or `undefined` while idle or before the first call.
  phase: TxPhase | undefined;
  /// Ordered step list for the active op, set when the mutation starts.
  steps: Step[];
  /// A terminal phase has been reached. Set when `set` receives one — flushed,
  /// settled or failed — even if it is not in the step list, letting the form
  /// mark the last step done without admitting out-of-list ids into `phase`.
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
  // Steps are mirrored in a ref so `set`, captured by long-lived async callers
  // such as the SDK's `onPhase` or the lifecycle tracker, always sees the current
  // list. Bound at click time it would see an empty list and drop every
  // transition.
  const stepsRef = useRef<Step[]>([]);
  // Phase that closes the stepper, defaulting to the last step id at start.
  // Deposits override with `flushed`, so the `mined` phase — which sits on the
  // last step — does not complete it early.
  const terminalRef = useRef<TxPhase | undefined>(undefined);
  // Phase transitions outside the active step list are dropped. The lifecycle
  // fires "settled" for any op with own commitments, including deposits whose
  // step list ends earlier; without this guard the stepper would regress to
  // all-pending when such a phase arrives.
  const set = useCallback((p: TxPhase) => {
    const list = stepsRef.current;
    // Done when the configured terminal phase fires — the last step id for a
    // spend, `flushed` for a deposit — or when any global terminal phase does,
    // which covers out-of-list catch-up emissions.
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
