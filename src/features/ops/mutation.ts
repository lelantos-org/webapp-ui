// What every react-query mutation hook for a shielded op shares. Each hook
// returns the mutation result plus a `progress` view for the form's stepper; the
// hooks themselves live with the flow that runs them (`flows/*/use-*.ts`).

import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useActiveChain } from "@/features/chain";
import { type ProgressView, type TxProgressApi, type TxResult, useTxProgress } from "@/features/tx";
import { useInvalidateWalletState, useWalletInstance } from "@/features/wallet";
import { isDuplicateSpend } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";
import { toastError } from "@/shared/lib/toast";
import { createSdkActions, type ShieldedActions } from "./sdk-adapter";
import { type TrackTxArgs, type TrackTxRequest, useTxTracker } from "./use-tx-tracker";

const log = createLogger("actions:spend");

/// The SDK actions bound to the current wallet, or `undefined` while the wallet
/// isn't ready. Mutation hooks should fail loudly (`requireActions`) rather than
/// silently no-op.
///
/// Memoised on the wallet and chain, so the actions keep their identity across
/// the renders in between rather than being rebuilt for each.
function useShieldedActions(): ShieldedActions | undefined {
  const wallet = useWalletInstance();
  const chain = useActiveChain();
  return useMemo(() => (wallet ? createSdkActions(wallet, chain) : undefined), [wallet, chain]);
}

export function requireActions(a: ShieldedActions | undefined): ShieldedActions {
  if (!a) throw new Error("wallet not ready");
  return a;
}

/// One policy for post-submit bookkeeping across all four mutations.
///
/// Never returned to react-query: a returned promise is awaited inside
/// react-query's own `try`, so a rejection would flip an already-broadcast tx to
/// `error` — red stepper, "failed" toast, `m.data` discarded and so no explorer
/// link, no pending overlay and no lifecycle watch. Floating the call instead
/// would surface a rejection as an unhandled rejection and leave the stepper
/// stalled, so the rejection is caught and logged here.
export function trackPostSubmit(
  track: (args: TrackTxArgs) => Promise<void>,
  args: TrackTxArgs,
): void {
  void track(args).catch((e: unknown) => log.warn("post-submit tracking failed", e));
}

/// Common return shape for every action hook: the mutation and its progress
/// view. Forms read both.
export interface ActionMutation<I, R = TxResult> {
  mutation: UseMutationResult<R, Error, I>;
  progress: ProgressView;
}

/// Failure path shared by the three ops that spend notes.
///
/// A duplicate-spend rejection is the one failure that reports on local state
/// rather than the request: the relayer refuses it because the notes are already
/// spent or in flight, meaning the note store still lists notes the chain has
/// consumed. Resyncing drops them so the next attempt selects live notes. Notes
/// merely in flight are not yet on-chain and survive the sync, and the message
/// directs the user to wait for those.
function useSpendFailed(): (label: string, progress: TxProgressApi, e: unknown) => void {
  const invalidateWallet = useInvalidateWalletState();
  return useCallback(
    (label, progress, e) => {
      progress.set("failed");
      if (isDuplicateSpend(e)) {
        log.warn(`${label}: notes already spent or in flight, resyncing`, e.body);
        // Fire-and-forget: the toast carries the user-facing answer, and a
        // failing sync must not replace the error explaining the refusal.
        void invalidateWallet();
      }
      toastError(`${label} failed`, e);
    },
    [invalidateWallet],
  );
}

/// What one op does that the others do not.
///
/// Every op differs only in the call it makes, the tracker request it produces,
/// and — for a few — what else a success or failure has to settle. Everything
/// around that — the stepper, the failure toast and the post-submit tracking —
/// is one policy, stated once in `useTrackedMutation`.
export interface TrackedSpec<I, R extends TxResult> {
  /// Names the op in the failure toast and in the tracker. A function because
  /// withdraw's label depends on whether the native-ETH bridge is used.
  label(input: I): string;
  /// Start the stepper and drive the op. The step list is op-specific, so
  /// `progress.start` is the callee's to call.
  run(actions: ShieldedActions, input: I, progress: TxProgressApi): Promise<R>;
  /// The tracker request for a broadcast result. Built per op because
  /// `TrackTxRequest` correlates `kind` with the shape of `result`, which a
  /// generic `{ kind, result }` pair would erase.
  track(input: I, result: R): TrackTxRequest;
  /// Bookkeeping a success settles before it is tracked — a deposit's
  /// transparent balance, which the funds have just left.
  onSuccess?(result: R, input: I): void;
  /// The failure path. Marks the stepper failed and toasts by default.
  onError?(label: string, progress: TxProgressApi, e: unknown): void;
}

/// The default failure path: the stepper reads failed and the toast says why.
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
      // Not returned; see `trackPostSubmit`.
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

/// A note-spending op: transfer, withdraw, swap. The tracked policy, with the
/// duplicate-spend resync on failure.
export type SpendSpec<I, R extends TxResult> = Omit<TrackedSpec<I, R>, "onError">;

export function useSpendMutation<I, R extends TxResult>(
  spec: SpendSpec<I, R>,
): ActionMutation<I, R> {
  const spendFailed = useSpendFailed();
  return useTrackedMutation({ ...spec, onError: spendFailed });
}
