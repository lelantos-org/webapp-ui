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
import type {
  DepositCall,
  SwapCall,
  TransferCall,
  TxResult,
  WithAsset,
  WithdrawCall,
} from "@/features/actions/port";
import { stepsFor, terminalFor } from "@/features/actions/tx/tx-progress";
import { type TxProgressApi, useTxProgress } from "@/features/actions/tx/use-tx-progress";
import { useTxTracker } from "@/features/actions/tx/use-tx-tracker";
import { requireActions, useShieldedActions } from "@/features/actions/use-shielded-actions";
import { fetchAssetFeeInputs } from "@/features/assets/asset-entry";
import { useActiveChain } from "@/features/chain/ChainProvider";
import { preopenDepositStream } from "@/features/relayer/deposit-stream";
import { useWallet } from "@/features/wallet";
import { approvePermit2, needsPermit2Approval } from "@/features/wallet/permit2";
import { feeBreakdown } from "@/shared/lib/fees";
import { toastError } from "@/shared/lib/toast";

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

export function useDeposit(): ActionMutation<DepositCall> {
  const actions = useShieldedActions();
  const track = useTxTracker();
  const { wallet } = useWallet();
  const progress = useTxProgress();
  const chain = useActiveChain();
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
    onSuccess: (r) =>
      track({ label: "deposit", kind: "deposit", result: r, onPhase: progress.set }),
    onError: (e) => {
      progress.set("failed");
      toastError("deposit failed", e);
    },
  });
  return { mutation, progress: progressView(progress) };
}

export function useTransfer(): ActionMutation<TransferCall> {
  const actions = useShieldedActions();
  const track = useTxTracker();
  const { wallet } = useWallet();
  const progress = useTxProgress();
  const mutation = useMutation<WithAsset<TransferResult>, Error, TransferCall>({
    mutationFn: async (i) => {
      const a = requireActions(actions);
      progress.start(stepsFor("transfer"));
      return a.transfer({
        to: i.to,
        amount: i.amount,
        asset: i.asset,
        onPhase: progress.set,
      });
    },
    onSuccess: (r, i) =>
      track({
        label: "transfer",
        kind: "transfer",
        result: r,
        isSelfTransfer: !!wallet && i.to === wallet.address,
        onPhase: progress.set,
      }),
    onError: (e) => {
      progress.set("failed");
      toastError("transfer failed", e);
    },
  });
  return { mutation, progress: progressView(progress) };
}

export function useWithdraw(): ActionMutation<WithdrawCall> {
  const actions = useShieldedActions();
  const track = useTxTracker();
  const progress = useTxProgress();
  const mutation = useMutation<WithAsset<WithdrawResult>, Error, WithdrawCall>({
    mutationFn: async (i) => {
      const a = requireActions(actions);
      progress.start(stepsFor("withdraw"));
      return i.asEth
        ? a.withdrawEth({
            to: i.to,
            amount: i.amount,
            asset: i.asset,
            onPhase: progress.set,
          })
        : a.withdraw({
            to: i.to,
            amount: i.amount,
            asset: i.asset,
            onPhase: progress.set,
          });
    },
    onSuccess: (r, i) =>
      track({
        label: i.asEth ? "withdraw eth" : "withdraw",
        kind: i.asEth ? "withdrawEth" : "withdraw",
        result: r,
        onPhase: progress.set,
      }),
    onError: (e) => {
      progress.set("failed");
      toastError("withdraw failed", e);
    },
  });
  return { mutation, progress: progressView(progress) };
}

export function useSwap(): ActionMutation<SwapCall> {
  const actions = useShieldedActions();
  const track = useTxTracker();
  const progress = useTxProgress();
  const mutation = useMutation<WithAsset<SwapResult>, Error, SwapCall>({
    mutationFn: async (i) => {
      const a = requireActions(actions);
      progress.start(stepsFor("swap"));
      return a.swap({
        assetIn: i.assetIn,
        assetOut: i.assetOut,
        amount: i.amount,
        quote: i.quote,
        onPhase: progress.set,
      });
    },
    onSuccess: (r, i) =>
      track({ label: "swap", kind: "swap", result: r, swap: i, onPhase: progress.set }),
    onError: (e) => {
      progress.set("failed");
      toastError("swap failed", e);
    },
  });
  return { mutation, progress: progressView(progress) };
}
