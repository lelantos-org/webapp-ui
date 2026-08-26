// The claim-link mutation.
//
// Lives here rather than in `features/actions/mutations`, whose other mutations
// carry no claim-link logic. Placing it there would make `features/actions`
// import `features/claim-link`, which already imports `features/actions` for the
// shared form and progress machinery.

import type { TransferResult } from "@lelantos-org/sdk";
import { useMutation } from "@tanstack/react-query";
import type { GenerateLinkCall, WithAsset } from "@/features/actions";
import {
  type ActionMutation,
  progressView,
  stepsFor,
  trackPostSubmit,
  useTxProgress,
  useTxTracker,
} from "@/features/actions";
import { useActiveChain } from "@/features/chain";
import { currentWalletChainId } from "@/features/eip1193";
import { useInvalidateWalletState, useWallet } from "@/features/wallet";
import { toastError } from "@/shared/lib/toast";
import { type GenerateClaimLinkResult, generateClaimLink } from "./ephemeral-wallet";

export function useGenerateLink(): ActionMutation<GenerateLinkCall, GenerateClaimLinkResult> {
  const { wallet } = useWallet();
  const track = useTxTracker();
  const invalidate = useInvalidateWalletState();
  const progress = useTxProgress();
  const chain = useActiveChain();
  const mutation = useMutation<GenerateClaimLinkResult, Error, GenerateLinkCall>({
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
  return { mutation, progress: progressView(progress) };
}
