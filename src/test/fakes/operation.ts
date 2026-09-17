import type { UseMutationResult } from "@tanstack/react-query";
import type { ActionMutation } from "@/features/ops";
import type { ProgressView } from "@/features/tx";

/// A stepper that has not started.
export function idleProgress(): ProgressView {
  return {
    phase: undefined,
    steps: [],
    done: false,
    failedAt: undefined,
    endedAs: undefined,
    provingSince: undefined,
    reset() {},
  };
}

/// An idle `ActionMutation` whose submit runs `mutateAsync`.
export function fakeActionMutation<I, R>(
  mutateAsync: (input: I) => Promise<R> = async () => ({}) as R,
): ActionMutation<I, R> {
  const mutation = {
    mutateAsync,
    isPending: false,
    error: null,
    data: undefined,
    reset() {},
  } as unknown as UseMutationResult<R, Error, I>;
  return { mutation, progress: idleProgress() };
}
