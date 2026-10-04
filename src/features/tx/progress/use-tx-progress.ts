import { useCallback, useEffect, useId } from "react";
import {
  localOpKey,
  noteOpAmount,
  observeOp,
  setOpPhase,
  startOpSteps,
  type TxProgress,
  useOp,
} from "./op-store";
import type { Step, TxPhase } from "./tx-progress";

export type { TxProgress } from "./op-store";

export interface TxProgressApi extends TxProgress {
  set(phase: TxPhase): void;
  /// Begin an op. Its terminal phase is `terminalOf(steps)`.
  start(steps: Step[]): void;
  reset(): void;
  /// Record what the op moves, in the form's words.
  noteAmount(amount: string): void;
}

/// The slice of `TxProgressApi` a form reads; only the op's mutation can advance it.
export type ProgressView = Omit<TxProgressApi, "set" | "start">;

/// An op's stepper. With a `key` it is shared by every caller of that key and outlives them;
/// without one it belongs to this caller alone.
export function useTxProgress(key?: string): TxProgressApi {
  const own = useId();
  const k = key ?? localOpKey(own);
  const op = useOp(k);
  useEffect(() => observeOp(k), [k]);

  // Stable per key: long-lived async callers capture them once.
  const set = useCallback((phase: TxPhase) => setOpPhase(k, phase), [k]);
  const start = useCallback((steps: Step[]) => startOpSteps(k, steps), [k]);
  const reset = useCallback(() => startOpSteps(k, []), [k]);
  const noteAmount = useCallback((amount: string) => noteOpAmount(k, amount), [k]);

  return {
    phase: op.phase,
    steps: op.steps,
    done: op.done,
    failedAt: op.failedAt,
    endedAs: op.endedAs,
    provingSince: op.provingSince,
    amount: op.amount,
    set,
    start,
    reset,
    noteAmount,
  };
}
