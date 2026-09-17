import { useMutation } from "@tanstack/react-query";
import { useActiveChain } from "@/features/chain";
import { type GenerateClaimLinkResult, generateClaimLink } from "@/features/claim-links";
import {
  type ActionMutation,
  type GenerateLinkCall,
  spendStep,
  trackPostSubmit,
  useTxTracker,
} from "@/features/ops";
import { stepsFor, useTxProgress } from "@/features/tx";
import { useInvalidateWalletState, useWalletInstance } from "@/features/wallet";
import { currentWalletChainId } from "@/features/wallet-kinds";
import { toastError } from "@/shared/lib/toast";

/// `GenerateLinkCall` plus the relayer's fee asset.
export type GenerateLinkRequest = GenerateLinkCall & { feeAsset?: bigint | undefined };

/// The claim-link mutation: a transfer to an ephemeral wallet built for the link.
export function useGenerateLink(): ActionMutation<GenerateLinkRequest, GenerateClaimLinkResult> {
  const wallet = useWalletInstance();
  const track = useTxTracker();
  const invalidate = useInvalidateWalletState();
  const progress = useTxProgress();
  const chain = useActiveChain();
  const mutation = useMutation<GenerateClaimLinkResult, Error, GenerateLinkRequest>({
    mutationFn: async (i) => {
      if (!wallet) throw new Error("wallet not ready");
      progress.start(stepsFor("transfer"));
      // `currentChainId` rechecks the chain before spending, or the link could name the wrong pool.
      return generateClaimLink(wallet, {
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
        label: "claim link",
        kind: "transfer",
        result: r.tx,
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
  return { mutation, progress };
}
