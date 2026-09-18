import type { CircuitAmount } from "@lelantos-org/sdk";
import { useMutation } from "@tanstack/react-query";
import { createAgent, type FundAgentResult } from "@/features/agents";
import { useActiveChain } from "@/features/chain";
import { type ActionMutation, spendStep, trackPostSubmit, useTxTracker } from "@/features/ops";
import { stepsFor, useTxProgress } from "@/features/tx";
import { useInvalidateWalletState, useWalletInstance } from "@/features/wallet";
import { currentWalletChainId } from "@/features/wallet-kinds";
import { toastError } from "@/shared/lib/toast";

export interface CreateAgentRequest {
  label: string;
  amount: CircuitAmount;
  asset: bigint;
  feeAsset?: bigint | undefined;
}

/// Funding an agent: a transfer to a freshly minted ephemeral wallet.
export function useCreateAgent(): ActionMutation<CreateAgentRequest, FundAgentResult> {
  const wallet = useWalletInstance();
  const track = useTxTracker();
  const invalidate = useInvalidateWalletState();
  const progress = useTxProgress();
  const chain = useActiveChain();

  const mutation = useMutation<FundAgentResult, Error, CreateAgentRequest>({
    mutationFn: async (i) => {
      if (!wallet) throw new Error("wallet not ready");
      progress.start(stepsFor("transfer"));
      // `currentChainId` rechecks the chain before spending, or the agent record
      // could name a pool its notes are not in.
      return createAgent(wallet, {
        label: i.label,
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
        label: "fund agent",
        kind: "transfer",
        result: r.tx,
        isSelfTransfer: false,
        onPhase: progress.set,
      });
      void invalidate();
    },
    onError: (e) => {
      progress.set("failed");
      toastError("funding the agent failed", e);
    },
  });

  return { mutation, progress };
}
