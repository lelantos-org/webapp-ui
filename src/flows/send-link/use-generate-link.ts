// The claim-link mutation.
//
// Like every op's mutation it lives with its flow, on the shared post-submit and
// progress machinery in `features/ops`. It is not a `useSpendMutation`: the
// transfer runs from an ephemeral wallet built for the link, not through the
// connected wallet's SDK actions.

import type { TransferResult } from "@lelantos-org/sdk";
import { useMutation } from "@tanstack/react-query";
import { useActiveChain } from "@/features/chain";
import { type GenerateClaimLinkResult, generateClaimLink } from "@/features/claim-links";
import {
  type ActionMutation,
  type GenerateLinkCall,
  trackPostSubmit,
  useTxTracker,
} from "@/features/ops";
import { stepsFor, useTxProgress, type WithAsset } from "@/features/tx";
import { useInvalidateWalletState, useWalletInstance } from "@/features/wallet";
import { currentWalletChainId } from "@/features/wallet-kinds";
import { toastError } from "@/shared/lib/toast";

/// `GenerateLinkCall` plus the relayer's fee asset. Widened here rather than in
/// `ops/sdk-adapter.ts`, which only names the call shapes the adapter takes.
export type GenerateLinkRequest = GenerateLinkCall & { feeAsset?: bigint | undefined };

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
      // `chain` is read at render, while the transfer lands seconds later after
      // proving. `currentChainId` lets `generateClaimLink` confirm the wallet has
      // not moved before it spends; otherwise the link is stamped with one chain
      // and the funds land on another, leaving the claimer scanning the wrong
      // pool.
      return generateClaimLink(wallet, {
        amount: i.amount,
        asset: i.asset,
        ...(i.feeAsset === undefined ? {} : { feeAsset: i.feeAsset }),
        chainId: chain.chainId,
        currentChainId: currentWalletChainId,
        onPhase: progress.set,
      });
    },
    onSuccess: (r, i) => {
      // `r.tx` is the SDK `TransferResult`; tagging it with the asset id lets the
      // tracker drive the pending-tx overlay and the lifecycle.
      const tagged: WithAsset<TransferResult> = Object.assign(r.tx, { asset: i.asset });
      // Through the shared boundary rather than a bare `void track(...)`; see
      // `trackPostSubmit`. Floating it would turn any rejection into an unhandled
      // one on the path that has just produced a bearer key.
      trackPostSubmit(track, {
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
  return { mutation, progress };
}
