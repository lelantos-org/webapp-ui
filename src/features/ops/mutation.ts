import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { type ProgressView, type TxProgressApi, type TxResult, useTxProgress } from "@/features/tx";
import { useInvalidateWalletState, useWalletInstance } from "@/features/wallet";
import { isDuplicateSpend } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";
import { toastError } from "@/shared/lib/toast";
import { createSdkActions, type ShieldedActions } from "./sdk-adapter";
import { type TrackTxArgs, type TrackTxRequest, useTxTracker } from "./use-tx-tracker";

const log = createLogger("actions:spend");

/// The SDK actions bound to the current wallet, or `undefined` while it isn't ready.
function useShieldedActions(): ShieldedActions | undefined {
  const wallet = useWalletInstance();
  return useMemo(() => (wallet ? createSdkActions(wallet) : undefined), [wallet]);
}

export function requireActions(a: ShieldedActions | undefined): ShieldedActions {
  if (!a) throw new Error("wallet not ready");
  return a;
}

/// Run post-submit tracking detached from react-query, where a rejection would mark a sent tx failed.
export function trackPostSubmit(
  track: (args: TrackTxArgs) => Promise<void>,
  args: TrackTxArgs,
): void {
  void track(args).catch((e: unknown) => log.warn("post-submit tracking failed", e));
}

/// An action hook's mutation and its progress view.
export interface ActionMutation<I, R = TxResult> {
  mutation: UseMutationResult<R, Error, I>;
  progress: ProgressView;
}

/// Failure path for note-spending ops: a duplicate-spend rejection resyncs stale notes.
function useSpendFailed(): (label: string, progress: TxProgressApi, e: unknown) => void {
  const invalidateWallet = useInvalidateWalletState();
  return useCallback(
    (label, progress, e) => {
      markFailed(label, progress, e);
      if (isDuplicateSpend(e)) {
        // Log the reason, not the body: the relayer's text can echo the submitted payload.
        log.warn(`${label}: notes already spent or in flight, resyncing`, { reason: e.reason });
        void invalidateWallet();
      }
    },
    [invalidateWallet],
  );
}

/// What one op does differently; the shared policy lives in `useTrackedMutation`.
export interface TrackedSpec<I, R extends TxResult> {
  /// Names the op in the failure toast and the tracker.
  label(input: I): string;
  /// Start the stepper and drive the op.
  run(actions: ShieldedActions, input: I, progress: TxProgressApi): Promise<R>;
  /// The tracker request for a broadcast result.
  track(input: I, result: R): TrackTxRequest;
  /// Bookkeeping a success settles before it is tracked.
  onSuccess?(result: R, input: I): void;
  /// The failure path. Marks the stepper failed and toasts by default.
  onError?(label: string, progress: TxProgressApi, e: unknown): void;
}

function markFailed(label: string, progress: TxProgressApi, e: unknown): void {
  progress.set("failed");
  toastError(`${label} failed`, e);
}

export function useTrackedMutation<I, R extends TxResult>(
  spec: TrackedSpec<I, R>,
): ActionMutation<I, R> {
  const actions = useShieldedActions();
  const track = useTxTracker();
  const progress = useTxProgress();
  const mutation = useMutation<R, Error, I>({
    mutationFn: (input) => spec.run(requireActions(actions), input, progress),
    onSuccess: (result, input) => {
      spec.onSuccess?.(result, input);
      trackPostSubmit(track, {
        ...spec.track(input, result),
        label: spec.label(input),
        onPhase: progress.set,
      });
    },
    onError: (e, input) => (spec.onError ?? markFailed)(spec.label(input), progress, e),
  });
  return { mutation, progress };
}

/// A note-spending op's spec: tracked, with the duplicate-spend resync on failure.
export type SpendSpec<I, R extends TxResult> = Omit<TrackedSpec<I, R>, "onError">;

export function useSpendMutation<I, R extends TxResult>(
  spec: SpendSpec<I, R>,
): ActionMutation<I, R> {
  const spendFailed = useSpendFailed();
  return useTrackedMutation({ ...spec, onError: spendFailed });
}
