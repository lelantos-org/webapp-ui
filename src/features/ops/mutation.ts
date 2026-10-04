import {
  isWalletError,
  type SpendPhase,
  type TransferResult,
  type WalletApi,
} from "@lelantos-org/sdk";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useId, useMemo } from "react";
import { useActiveChain } from "@/features/chain";
import {
  beginOp,
  clearOpOutcome,
  failOp,
  isOpObserved,
  localOpKey,
  type OpRecord,
  opKey,
  opScope,
  type ProgressView,
  type Step,
  settleOp,
  type TxProgressApi,
  type TxResult,
  useOp,
  useTxProgress,
} from "@/features/tx";
import { useInvalidateWalletState, useWalletInstance } from "@/features/wallet";
import { currentWalletChainId } from "@/features/wallet-kinds";
import { classifyError, isDuplicateSpend, isFeeMoved } from "@/shared/lib/errors";
import { createLogger } from "@/shared/lib/logger";
import { toastError } from "@/shared/lib/toast";
import { queryKeys } from "@/shared/query/keys";
import { createSdkActions, type ShieldedActions, spendPhases, spendSteps } from "./sdk-adapter";
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
function trackPostSubmit(track: (args: TrackTxArgs) => Promise<void>, args: TrackTxArgs): void {
  void track(args).catch((e: unknown) => log.warn("post-submit tracking failed", e));
}

export interface ActionMutation<I, R = TxResult> {
  mutation: UseMutationResult<R, Error, I>;
  progress: ProgressView;
}

/// Re-prices the fee quote after a spend the relayer's fee outgrew, so a retry reviews the new fee.
function useRepriceOnFeeMoved(): (e: unknown) => void {
  const wallet = useWalletInstance();
  const { chainId } = useActiveChain();
  const qc = useQueryClient();
  const address = wallet?.address;
  return useCallback(
    (e) => {
      if (!isWalletError(e, "FEE_ABOVE_LIMIT") && !isFeeMoved(e)) return;
      void qc.invalidateQueries({ queryKey: queryKeys.feeQuote(chainId, address) });
    },
    [qc, chainId, address],
  );
}

/// What a failed note-spending op needs done: a fee that moved is re-priced, and a
/// duplicate-spend rejection resyncs stale notes.
function useSpendFailed(): (e: unknown, label: string) => void {
  const invalidateWallet = useInvalidateWalletState();
  const reprice = useRepriceOnFeeMoved();
  return useCallback(
    (e, label) => {
      reprice(e);
      if (isDuplicateSpend(e)) {
        // Log the reason, not the body: the relayer's text can echo the submitted payload.
        log.warn(`${label}: notes already spent or in flight, resyncing`, { reason: e.reason });
        void invalidateWallet();
      }
    },
    [invalidateWallet, reprice],
  );
}

/// The per-op parts of a tracked mutation, over whatever `run` drives the op with.
interface MutationSpec<I, R> {
  /// Identifies the form's op, so one in flight is found again after the form remounts. Leave
  /// out where several instances are mounted at once: each then keeps its own.
  key?: string | undefined;
  /// Names the op in the failure toast and the tracker.
  label(input: I): string;
  /// The failure toast's title. Default: the label and "failed".
  failedTitle?: string | undefined;
  /// `run` resolves only once the transaction is mined, as every relayed spend does: the stepper
  /// then ends with it instead of waiting on the tracker's own read of the receipt.
  minedOnResolve?: boolean;
  /// Start the stepper and drive the op.
  run(input: I, progress: TxProgressApi): Promise<R>;
  /// The tracker request for a broadcast result.
  track(input: I, result: R): TrackTxRequest;
  /// Bookkeeping a success settles before it is tracked.
  onSuccess?(result: R, input: I): void;
  /// What else a failure needs, once the stepper is marked and the user told.
  onError?(e: unknown, label: string): void;
}

/// The per-op parts of `useTrackedMutation`: `run` drives the op through the SDK actions.
export interface TrackedSpec<I, R extends TxResult> extends Omit<MutationSpec<I, R>, "run"> {
  run(actions: ShieldedActions, input: I, progress: TxProgressApi): Promise<R>;
}

/// `mutation` as the form sees it. The op's state is read from the op store as well as from this
/// hook, so a form mounted while its op is already running, or after it ended, shows that op.
function useOutlivingMutation<I, R>(
  mutation: UseMutationResult<R, Error, I>,
  op: OpRecord,
  key: string,
): UseMutationResult<R, Error, I> {
  const { reset: resetMutation } = mutation;
  const reset = useCallback(() => {
    resetMutation();
    clearOpOutcome(key);
  }, [resetMutation, key]);

  const error = mutation.error ?? (op.status === "failed" ? op.error : null);
  return useMemo(
    () =>
      ({
        ...mutation,
        isPending: mutation.isPending || op.status === "running",
        // The user calling it off in their wallet is not a failure to show: the form stays as it was.
        error: isCancellation(error) ? null : error,
        data: mutation.data ?? (op.status === "done" ? op.result : undefined),
        reset,
      }) as UseMutationResult<R, Error, I>,
    [mutation, op, error, reset],
  );
}

const isCancellation = (e: unknown): boolean => e != null && classifyError(e).kind === "rejected";

/// Where the op named `name` is kept for the current account; this hook's own slot without a name.
function useOpSlot(name: string | undefined): { scope: string; key: string } {
  const wallet = useWalletInstance();
  const { chainId } = useActiveChain();
  const own = useId();
  const scope = opScope(chainId, wallet?.address);
  return { scope, key: name === undefined ? localOpKey(own) : opKey(scope, name) };
}

function useMutationOf<I, R>(spec: MutationSpec<I, R>): ActionMutation<I, R> {
  const track = useTxTracker();
  const { scope, key } = useOpSlot(spec.key);
  const progress = useTxProgress(key);
  const op = useOp(key);
  const mutation = useMutation<R, Error, I>({
    mutationFn: (input) => {
      beginOp(key, { label: spec.label(input), path: window.location.pathname, scope });
      return spec.run(input, progress);
    },
    onSuccess: (result, input) => {
      settleOp(key, result);
      if (spec.minedOnResolve) progress.set("mined");
      spec.onSuccess?.(result, input);
      trackPostSubmit(track, {
        ...spec.track(input, result),
        label: spec.label(input),
        onPhase: progress.set,
      });
    },
    onError: (e, input) => {
      const label = spec.label(input);
      const title = spec.failedTitle ?? `${label} failed`;
      if (isCancellation(e)) {
        // Back to the form as it was, with one line saying it was called off.
        progress.reset();
        clearOpOutcome(key);
        toastError(title, e);
        return;
      }
      failOp(key, e);
      progress.set("failed");
      // The form that started it says so itself; the toast is for when it is no longer there.
      if (!isOpObserved(key)) toastError(title, e);
      spec.onError?.(e, label);
    },
  });
  return { mutation: useOutlivingMutation(mutation, op, key), progress };
}

export function useTrackedMutation<I, R extends TxResult>(
  spec: TrackedSpec<I, R>,
): ActionMutation<I, R> {
  const actions = useShieldedActions();
  return useMutationOf({
    ...spec,
    run: async (input, progress) => spec.run(requireActions(actions), input, progress),
  });
}

/// A note-spending op's spec: tracked, with the duplicate-spend resync on failure.
export type SpendSpec<I, R extends TxResult> = Omit<TrackedSpec<I, R>, "onError">;

export function useSpendMutation<I, R extends TxResult>(
  spec: SpendSpec<I, R>,
): ActionMutation<I, R> {
  const spendFailed = useSpendFailed();
  return useTrackedMutation({ ...spec, minedOnResolve: true, onError: spendFailed });
}

/// What `useWalletTransfer` hands `run` besides the op's own input.
export interface WalletTransferContext {
  chainId: bigint;
  /// Read right before the spend, so a chain switch mid-proof cannot mislabel what `run` records.
  currentChainId: () => bigint | undefined;
  onPhase: (phase: SpendPhase) => void;
}

export interface WalletTransferSpec<I, R extends { tx: TransferResult }> {
  /// See `MutationSpec.key`.
  key?: string;
  /// Names the op in the tracker.
  label: string;
  /// The failure toast's title.
  failed: string;
  /// What `run` does before it spends, shown as the stepper's first step.
  lead?: Step;
  run(wallet: WalletApi, input: I, ctx: WalletTransferContext): Promise<R>;
}

/// A transfer a feature runs on the wallet itself, to an address it mints or holds a record of.
export function useWalletTransfer<I, R extends { tx: TransferResult }>(
  spec: WalletTransferSpec<I, R>,
): ActionMutation<I, R> {
  const wallet = useWalletInstance();
  const chain = useActiveChain();
  const invalidate = useInvalidateWalletState();
  const reprice = useRepriceOnFeeMoved();
  return useMutationOf<I, R>({
    key: spec.key,
    label: () => spec.label,
    failedTitle: spec.failed,
    minedOnResolve: true,
    run: async (input, progress) => {
      if (!wallet) throw new Error("wallet not ready");
      const steps = spendSteps("transfer");
      progress.start(spec.lead ? [spec.lead, ...steps] : steps);
      if (spec.lead) progress.set(spec.lead.id);
      return spec.run(wallet, input, {
        chainId: chain.chainId,
        currentChainId: currentWalletChainId,
        onPhase: spendPhases(progress.set),
      });
    },
    track: (_input, result) => ({ kind: "transfer", result: result.tx, isSelfTransfer: false }),
    onSuccess: () => void invalidate(),
    onError: reprice,
  });
}
