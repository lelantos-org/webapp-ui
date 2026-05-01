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
import { env } from "@/config/env";
import type {
  DepositCall,
  GenerateLinkCall,
  SwapCall,
  TransferCall,
  TxResult,
  WithAsset,
  WithdrawCall,
} from "@/features/actions/port";
import { stepsFor, terminalFor } from "@/features/actions/tx-progress";
import { requireActions, useShieldedActions } from "@/features/actions/use-shielded-actions";
import { type TxProgressApi, useTxProgress } from "@/features/actions/use-tx-progress";
import { useTxTracker } from "@/features/actions/use-tx-tracker";
import { type GenerateClaimLinkResult, generateClaimLink } from "@/features/claim-link/claimLink";
import { preopenIntentStream } from "@/features/relayer/intent-stream";
import { useWallet } from "@/features/wallet";
import { approvePermit2, needsPermit2Approval } from "@/features/wallet/permit2";
import { useInvalidateWalletState } from "@/features/wallet/use-wallet-state";
import { toastError } from "@/shared/lib/toast";

/// Common return shape for every action hook: react-query mutation +
/// progress view. Forms read both.
export interface ActionMutation<I, R = TxResult> {
  mutation: UseMutationResult<R, Error, I>;
  progress: {
    steps: TxProgressApi["steps"];
    phase: TxProgressApi["phase"];
    done: TxProgressApi["done"];
  };
}

export function useDeposit(): ActionMutation<DepositCall> {
  const actions = useShieldedActions();
  const track = useTxTracker();
  const { wallet } = useWallet();
  const progress = useTxProgress();
  const mutation = useMutation<WithAsset<DepositResult>, Error, DepositCall>({
    mutationFn: async (i) => {
      if (!wallet) throw new Error("wallet not ready");
      const a = requireActions(actions);
      const w = wallet as WalletApi;

      // Subscribe to the relayer SSE before sending the tx. The relayer's
      // broadcast channel only delivers events emitted *after* a receiver
      // is attached, so on fast devnets the Flushed event can land before
      // `trackTxLifecycle` subscribes — leaving the stepper stuck on
      // "pending deposit". Preopen here keeps the listener buffer warm.
      preopenIntentStream(env.chainId);

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

      const total = await computeDepositTotal(w, i.asset, i.amount);
      const tokenAddr = (await w.chain.fetchAsset(i.asset)).token;

      // AllowanceTransfer mode drops the per-deposit Permit2 sig. The
      // SetupFlow modal in DepositForm gates the form on missing/expired
      // allowance, so the window is expected to cover `total` here.
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

      // Legacy witness path for adapters/chains without the MASP
      // entrypoint. First-time deposit bundles the ERC20 max-approve into
      // the stepper.
      const needsApproval = await needsPermit2Approval(w, tokenAddr, total);
      progress.start(stepsFor("deposit", { asEth: false, needsApproval }), {
        terminal: terminalFor("deposit"),
      });
      if (needsApproval) {
        progress.set("approving");
        await approvePermit2(w, tokenAddr);
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
  return {
    mutation,
    progress: { steps: progress.steps, phase: progress.phase, done: progress.done },
  };
}

async function computeDepositTotal(
  wallet: WalletApi,
  asset: bigint,
  amount: bigint,
): Promise<bigint> {
  const entry = await wallet.chain.fetchAsset(asset);
  const feeBps = await wallet.chain.fetchFeeBps();
  const inAmt = amount * entry.scale;
  return inAmt + (inAmt * feeBps) / 10000n;
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
  return {
    mutation,
    progress: { steps: progress.steps, phase: progress.phase, done: progress.done },
  };
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
  return {
    mutation,
    progress: { steps: progress.steps, phase: progress.phase, done: progress.done },
  };
}

export function useGenerateLink(): ActionMutation<GenerateLinkCall, GenerateClaimLinkResult> {
  const { wallet } = useWallet();
  const track = useTxTracker();
  const invalidate = useInvalidateWalletState();
  const progress = useTxProgress();
  const mutation = useMutation<GenerateClaimLinkResult, Error, GenerateLinkCall>({
    mutationFn: (i) => {
      if (!wallet) throw new Error("wallet not ready");
      progress.start(stepsFor("transfer"));
      return generateClaimLink(wallet, {
        amount: i.amount,
        asset: i.asset,
        onPhase: progress.set,
      });
    },
    onSuccess: (r, i) => {
      // claimLink.tx is the SDK TransferResult; tag with the asset id so
      // the tracker can drive the pending-tx overlay + lifecycle.
      const tagged: WithAsset<TransferResult> = Object.assign(r.tx, { asset: i.asset });
      void track({
        label: "claim link",
        kind: "transfer",
        result: tagged,
        isSelfTransfer: false,
        onPhase: progress.set,
      });
      void invalidate();
    },
    onError: (e) => {
      progress.set("failed");
      toastError("claim link failed", e);
    },
  });
  return {
    mutation,
    progress: { steps: progress.steps, phase: progress.phase, done: progress.done },
  };
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
  return {
    mutation,
    progress: { steps: progress.steps, phase: progress.phase, done: progress.done },
  };
}

/// Shorthand for forms that don't care about the progress object.
export function bareMutation<I, R>(m: ActionMutation<I, R>): UseMutationResult<R, Error, I> {
  return m.mutation;
}
