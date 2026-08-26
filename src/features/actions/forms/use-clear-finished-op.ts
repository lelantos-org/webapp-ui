import { useCallback } from "react";
import type { ActionMutation, ProgressView } from "../mutations";

/// Returns a callback clearing what a finished op left on the form: the
/// stepper, the tx link and the inline error.
///
/// That residue outlives the submit by design. `onSubmit` empties the fields as
/// soon as the mutation resolves, so a stepper reading "completed" and the tx
/// hash beneath it are the user's only record that anything happened.
///
/// It stops being a record once the form is pointed at a different token: a
/// settled stepper above a freshly picked asset reads as a completed transfer of
/// that asset. The asset picker therefore calls this, rather than a timer or the
/// next submit, which comes too late.
///
/// Gated on `done` rather than `!isPending`. A mutation resolves once the tx is
/// broadcast, while `useTxTracker` keeps advancing the stepper through block
/// inclusion, so keying off `isPending` would clear a stepper still in motion.
/// `done` marks the op's terminal phase, which `useTxProgress` also sets on
/// `failed`, so a failed op's error clears on the same gesture.
export function useClearFinishedOp<I, R>(
  mutation: ActionMutation<I, R>["mutation"],
  progress: ProgressView,
): () => void {
  const { done, reset: resetProgress } = progress;
  const { reset: resetMutation } = mutation;
  return useCallback(() => {
    if (!done) return;
    resetProgress();
    // Drops `data` (the tx hash) and `error` (the inline message) together.
    resetMutation();
  }, [done, resetProgress, resetMutation]);
}
