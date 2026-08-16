import { useCallback } from "react";
import type { ActionMutation, ProgressView } from "@/features/actions/mutations";

/// Returns a callback clearing what a finished op left on the form: the
/// stepper, the tx link and the inline error.
///
/// That residue outlives the submit on purpose. `onSubmit` empties the fields
/// as soon as the mutation resolves, so a stepper reading "completed" and the
/// tx hash beneath it are the only record the user has that anything
/// happened, and they have to survive long enough to be read.
///
/// They stop being a record of anything the moment the form is pointed at a
/// different token: a settled stepper sitting above a freshly-picked asset
/// reads as a completed transfer *of that asset*. Hence the asset picker is
/// what calls this — not a timer, and not the next submit, which is too late.
///
/// Gated on `done`, not on `!isPending`. A mutation resolves once the tx is
/// broadcast, but `useTxTracker` goes on advancing the stepper through block
/// inclusion after that, so keying off `isPending` would wipe a stepper that
/// is still moving. `done` is the point where nothing further will arrive:
/// the op's terminal phase, which `useTxProgress` also sets on `failed`, so a
/// failed op's error clears on the same gesture.
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
