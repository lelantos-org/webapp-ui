import type { CircuitAmount, TransferResult } from "@lelantos-org/sdk";
import { useMutation } from "@tanstack/react-query";
import { topUpAgent } from "@/features/agents";
import { useActiveChain } from "@/features/chain";
import { type ActionMutation, spendStep, trackPostSubmit, useTxTracker } from "@/features/ops";
import { stepsFor, useTxProgress } from "@/features/tx";
import { useInvalidateWalletState, useWalletInstance } from "@/features/wallet";
import { currentWalletChainId } from "@/features/wallet-kinds";
import { toastError } from "@/shared/lib/toast";

export interface TopUpResult {
  txHash: string;
  tx: TransferResult;
}

export interface TopUpRequest {
  address: string;
  amount: CircuitAmount;
  asset: bigint;
  feeAsset?: bigint | undefined;
}

/// Sending more to an agent that already exists. Mints nothing; the record is unchanged.
export function useTopUpAgent(): ActionMutation<TopUpRequest, TopUpResult> {
  const wallet = useWalletInstance();
  const track = useTxTracker();
  const invalidate = useInvalidateWalletState();
  const progress = useTxProgress();
  const chain = useActiveChain();

  const mutation = useMutation<TopUpResult, Error, TopUpRequest>({
    mutationFn: async (i) => {
      if (!wallet) throw new Error("wallet not ready");
      progress.start(stepsFor("transfer"));
      return topUpAgent(wallet, {
        address: i.address,
        amount: i.amount,
        asset: i.asset,
        ...(i.feeAsset === undefined ? {} : { feeAsset: i.feeAsset }),
        chainId: chain.chainId,
        currentChainId: currentWalletChainId,
        onPhase: (p) => {
          const step = spendStep(p);
          if (step !== undefined) progress.set(step);
        },
      });
    },
    onSuccess: (r) => {
      trackPostSubmit(track, {
        label: "top up agent",
        kind: "transfer",
        result: r.tx,
        isSelfTransfer: false,
        onPhase: progress.set,
      });
      void invalidate();
    },
    onError: (e) => {
      progress.set("failed");
      toastError("topping up the agent failed", e);
    },
  });

  return { mutation, progress };
}
