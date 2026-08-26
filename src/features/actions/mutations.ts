// React-query mutation hooks for shielded ops. Each hook returns the
// react-query mutation result plus an inline `progress` view for the
// form's stepper.

import {
  type DepositResult,
  type SwapResult,
  supportsAllowanceTransfer,
  type TransferResult,
  type WalletApi,
  type WithdrawResult,
} from "@lelantos-org/sdk";
import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import { fetchAssetFeeInputs, useInvalidateTransparentBalances } from "@/features/assets";
import { useActiveChain } from "@/features/chain";
import { preopenDepositStream } from "@/features/relayer";
import {
  approvePermit2,
  needsPermit2Approval,
  useInvalidateWalletState,
  useWallet,
} from "@/features/wallet";
import { isDuplicateSpend } from "@/shared/lib/errors";
import { feeBreakdown } from "@/shared/lib/fees";
import { createLogger } from "@/shared/lib/logger";
import { toastError } from "@/shared/lib/toast";
import type {
  DepositCall,
  ShieldedActions,
  SwapCall,
  TransferCall,
  TxResult,
  WithAsset,
  WithdrawCall,
} from "./port";
import { stepsFor, terminalFor } from "./tx/tx-progress";
import { type TxProgressApi, useTxProgress } from "./tx/use-tx-progress";
import { type TrackTxArgs, type TrackTxRequest, useTxTracker } from "./tx/use-tx-tracker";
import { requireActions, useShieldedActions } from "./use-shielded-actions";

const log = createLogger("actions:spend");

/// One policy for post-submit bookkeeping across all four mutations.
///
/// Not returned to react-query. A returned promise is awaited inside
/// react-query's own `try`, so a rejection flips an already-broadcast tx to
/// `error`: red stepper, "failed" toast, `m.data` discarded (hence no explorer
/// link), no pending overlay and no lifecycle watch. The deposit hook had the
/// mirror bug — it floated the same call, so a rejection became an unhandled
/// rejection and the stepper stuck on "sign transaction" forever. `useTxTracker`
/// no longer rejects; this keeps the boundary explicit either way.
export function trackPostSubmit(
  track: (args: TrackTxArgs) => Promise<void>,
  args: TrackTxArgs,
): void {
  void track(args).catch((e: unknown) => log.warn("post-submit tracking failed", e));
}

/// The slice of `TxProgressApi` a form needs: enough to render the stepper,
/// plus the `reset` that clears it. `set`/`start` stay with the mutation —
/// only the op that owns a stepper may advance it.
export interface ProgressView {
  steps: TxProgressApi["steps"];
  phase: TxProgressApi["phase"];
  done: TxProgressApi["done"];
  /// Clears the stepper. See `useClearFinishedOp` for when a form may.
  reset: TxProgressApi["reset"];
}

export function progressView(p: TxProgressApi): ProgressView {
  return { steps: p.steps, phase: p.phase, done: p.done, reset: p.reset };
}

/// Common return shape for every action hook: react-query mutation +
/// progress view. Forms read both.
export interface ActionMutation<I, R = TxResult> {
  mutation: UseMutationResult<R, Error, I>;
  progress: ProgressView;
}

/// Failure path shared by the three ops that spend notes.
///
/// A duplicate-spend rejection is the one failure that says something about
/// local state rather than about the request: the relayer refuses it because
/// the notes are already spent or in flight, which means the note store still
/// lists notes the chain has consumed. Resyncing drops them, so the user's
/// next attempt selects live notes instead of being refused again. Notes only
/// in flight are not on-chain yet and survive the sync — the message tells
/// the user to wait for those.
function useSpendFailed(): (label: string, progress: TxProgressApi, e: unknown) => void {
  const invalidateWallet = useInvalidateWalletState();
  return useCallback(
    (label, progress, e) => {
      progress.set("failed");
      if (isDuplicateSpend(e)) {
        log.warn(`${label}: notes already spent or in flight, resyncing`, e.body);
        // Fire-and-forget: the toast is the user's answer, and a sync failing
        // must not replace the error that explains what actually happened.
        void invalidateWallet();
      }
      toastError(`${label} failed`, e);
    },
    [invalidateWallet],
  );
}

/// What one note-spending op does that the others do not.
///
/// Transfer, withdraw and swap differ only in the call they make and the
/// tracker request they produce. Everything around that — the stepper, the
/// duplicate-spend resync, the failure toast, the post-submit tracking that
/// must not be returned to react-query — is one policy, stated once in
/// `useSpendMutation` rather than three times.
interface SpendSpec<I, R extends TxResult> {
  /// Names the op in the failure toast and in the tracker. A function because
  /// withdraw's depends on whether the native-ETH bridge is used.
  label(input: I): string;
  /// Start the stepper and drive the op. The step list is op-specific, so
  /// `progress.start` is the callee's to call.
  run(actions: ShieldedActions, input: I, progress: TxProgressApi): Promise<R>;
  /// The tracker request for a broadcast result. Built per op rather than
  /// assembled here: `TrackTxRequest` correlates `kind` with the shape of
  /// `result`, and a generic `{ kind, result }` pair would erase that.
  track(input: I, result: R): TrackTxRequest;
}

function useSpendMutation<I, R extends TxResult>(spec: SpendSpec<I, R>): ActionMutation<I, R> {
  const actions = useShieldedActions();
  const track = useTxTracker();
  const progress = useTxProgress();
  const spendFailed = useSpendFailed();
  const mutation = useMutation<R, Error, I>({
    mutationFn: (input) => spec.run(requireActions(actions), input, progress),
    onSuccess: (result, input) => {
      // Deliberately not returned — see `trackPostSubmit`.
      trackPostSubmit(track, {
        ...spec.track(input, result),
        label: spec.label(input),
        onPhase: progress.set,
      });
    },
    onError: (e, input) => spendFailed(spec.label(input), progress, e),
  });
  return { mutation, progress: progressView(progress) };
}

export function useDeposit(): ActionMutation<DepositCall> {
  const actions = useShieldedActions();
  const track = useTxTracker();
  const { wallet } = useWallet();
  const progress = useTxProgress();
  const chain = useActiveChain();
  const invalidateTransparent = useInvalidateTransparentBalances();
  const mutation = useMutation<WithAsset<DepositResult>, Error, DepositCall>({
    mutationFn: async (i) => {
      if (!wallet) throw new Error("wallet not ready");
      const a = requireActions(actions);
      const w = wallet as WalletApi;

      // Subscribe to the relayer SSE before sending the tx. The broadcast
      // channel only delivers events emitted after a receiver is attached,
      // so on fast chains the Flushed event can land before
      // `trackTxLifecycle` subscribes, stalling the stepper on
      // "pending deposit".
      preopenDepositStream(chain.chainId);

      // Native ETH path: one payable tx — contract wraps internally, no
      // approve, no Permit2 sig.
      if (i.asEth) {
        progress.start(stepsFor("deposit", { asEth: true }), {
          terminal: terminalFor("deposit", { asEth: true }),
        });
        return a.deposit({
          amount: i.amount,
          asset: i.asset,
          asEth: true,
          onPhase: progress.set,
        });
      }

      const { scale, feeBps, token } = await fetchAssetFeeInputs(w, i.asset);
      const { total } = feeBreakdown({ amount: i.amount, scale, feeBps, mode: "deposit" });

      // AllowanceTransfer mode needs no per-deposit Permit2 signature. The
      // SetupFlow modal in DepositForm gates the form on a missing or
      // expired allowance, so the window is expected to cover `total`.
      if (supportsAllowanceTransfer(w.chain)) {
        progress.start(stepsFor("deposit", { allowanceTransfer: true }), {
          terminal: terminalFor("deposit"),
        });
        return a.deposit({
          amount: i.amount,
          asset: i.asset,
          onPhase: progress.set,
        });
      }

      // Witness path, for adapters without the AllowanceTransfer entrypoint.
      // A first-time deposit bundles the ERC20 max-approve into the stepper.
      const needsApproval = await needsPermit2Approval(w, token, total);
      progress.start(stepsFor("deposit", { asEth: false, needsApproval }), {
        terminal: terminalFor("deposit"),
      });
      if (needsApproval) {
        progress.set("approving");
        await approvePermit2(w, token);
      }
      return a.deposit({
        amount: i.amount,
        asset: i.asset,
        onPhase: progress.set,
      });
    },
    onSuccess: (r) => {
      // The funds have left the transparent balance the form validates
      // against, and that query holds its value for `BALANCE_STALE_MS`.
      void invalidateTransparent();
      // Deliberately not returned — see `trackPostSubmit`.
      trackPostSubmit(track, {
        label: "deposit",
        kind: "deposit",
        result: r,
        onPhase: progress.set,
      });
    },
    onError: (e) => {
      progress.set("failed");
      toastError("deposit failed", e);
    },
  });
  return { mutation, progress: progressView(progress) };
}

export function useTransfer(): ActionMutation<TransferCall, WithAsset<TransferResult>> {
  const { wallet } = useWallet();
  return useSpendMutation<TransferCall, WithAsset<TransferResult>>({
    label: () => "transfer",
    run: (a, i, progress) => {
      progress.start(stepsFor("transfer"));
      return a.transfer({
        to: i.to,
        amount: i.amount,
        asset: i.asset,
        feeAsset: i.feeAsset,
        onPhase: progress.set,
      });
    },
    track: (i, result) => ({
      kind: "transfer",
      result,
      isSelfTransfer: !!wallet && i.to === wallet.address,
    }),
  });
}

export function useWithdraw(): ActionMutation<WithdrawCall, WithAsset<WithdrawResult>> {
  return useSpendMutation<WithdrawCall, WithAsset<WithdrawResult>>({
    label: (i) => (i.asEth ? "withdraw eth" : "withdraw"),
    run: (a, i, progress) => {
      progress.start(stepsFor("withdraw"));
      // Both entry points take the same request; only the unwrap differs.
      const req = {
        to: i.to,
        amount: i.amount,
        asset: i.asset,
        feeAsset: i.feeAsset,
        onPhase: progress.set,
      };
      return i.asEth ? a.withdrawEth(req) : a.withdraw(req);
    },
    track: (i, result) => ({ kind: i.asEth ? "withdrawEth" : "withdraw", result }),
  });
}

export function useSwap(): ActionMutation<SwapCall, WithAsset<SwapResult>> {
  return useSpendMutation<SwapCall, WithAsset<SwapResult>>({
    label: () => "swap",
    run: (a, i, progress) => {
      progress.start(stepsFor("swap"));
      return a.swap({
        assetIn: i.assetIn,
        assetOut: i.assetOut,
        amount: i.amount,
        quote: i.quote,
        feeAsset: i.feeAsset,
        onPhase: progress.set,
      });
    },
    track: (i, result) => ({ kind: "swap", result, swap: i }),
  });
}
