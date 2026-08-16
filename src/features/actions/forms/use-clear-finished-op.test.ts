import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useClearFinishedOp } from "@/features/actions/forms/use-clear-finished-op";
import type { ActionMutation, ProgressView } from "@/features/actions/mutations";

type Mutation = ActionMutation<unknown, unknown>["mutation"];

/// The hook reads four things off its arguments. Standing up a real
/// `useMutation` would drag in a QueryClient and a wallet to say nothing
/// more about the gate than these stubs do.
function harness(done: boolean) {
  const resetMutation = vi.fn();
  const resetProgress = vi.fn();
  const progress = (d: boolean): ProgressView => ({
    steps: [],
    phase: undefined,
    done: d,
    reset: resetProgress,
  });
  const { result, rerender } = renderHook(
    ({ d }) => useClearFinishedOp({ reset: resetMutation } as unknown as Mutation, progress(d)),
    { initialProps: { d: done } },
  );
  return { result, rerender, resetMutation, resetProgress };
}

describe("useClearFinishedOp", () => {
  it("clears the stepper and the mutation once the op is done", () => {
    const h = harness(true);
    h.result.current();
    expect(h.resetProgress).toHaveBeenCalledOnce();
    expect(h.resetMutation).toHaveBeenCalledOnce();
  });

  // The mutation resolves at broadcast while `useTxTracker` keeps advancing
  // the stepper toward block inclusion. Clearing there would blank a stepper
  // that is still moving, which is why the gate is `done` and not `isPending`.
  it("leaves a still-advancing stepper alone", () => {
    const h = harness(false);
    h.result.current();
    expect(h.resetProgress).not.toHaveBeenCalled();
    expect(h.resetMutation).not.toHaveBeenCalled();
  });

  it("starts clearing once the op reaches its terminal phase", () => {
    const h = harness(false);
    h.result.current();
    expect(h.resetProgress).not.toHaveBeenCalled();

    h.rerender({ d: true });
    h.result.current();
    expect(h.resetProgress).toHaveBeenCalledOnce();
    expect(h.resetMutation).toHaveBeenCalledOnce();
  });
});
