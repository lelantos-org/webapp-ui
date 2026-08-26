// The claim-link mutation.
//
// Lives here rather than in `features/actions/mutations` because it is the
// only mutation whose body is claim-link logic: keeping it there made
// `features/actions` import `features/claim-link`, which already imports
// `features/actions` for the shared form and progress machinery. The
// dependency now runs one way.

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
      // `chain` is read at render, but the transfer lands seconds later, after
      // proving. `currentChainId` lets `generateClaimLink` confirm the wallet
      // has not moved before it spends — otherwise the link is stamped with one
      // chain and the funds land on another, and the claimer scans the wrong
      // pool and is told "nothing to claim", which is indistinguishable from an
      // already-claimed link.
      return generateClaimLink(wallet, {
        amount: i.amount,
        asset: i.asset,
        chainId: chain.chainId,
        currentChainId: currentWalletChainId,
        onPhase: progress.set,
      });
    },
    onSuccess: (r, i) => {
      // claimLink.tx is the SDK TransferResult; tag with the asset id so
      // the tracker can drive the pending-tx overlay + lifecycle.
      const tagged: WithAsset<TransferResult> = Object.assign(r.tx, { asset: i.asset });
      // Through the shared boundary, not a bare `void track(...)`: see
      // `trackPostSubmit`. Floating it turned any rejection into an unhandled
      // one, on the path that has just produced a bearer key.
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
