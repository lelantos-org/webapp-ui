// The claim-link mutation.
//
// Lives here rather than in `features/actions/mutations` because it is the
// only mutation whose body is claim-link logic: keeping it there made
// `features/actions` import `features/claim-link`, which already imports
// `features/actions` for the shared form and progress machinery. The
// dependency now runs one way.

import type { TransferResult } from "@lelantos-org/sdk";
import { useMutation } from "@tanstack/react-query";
import { type ActionMutation, progressView } from "@/features/actions/mutations";
import type { GenerateLinkCall, WithAsset } from "@/features/actions/port";
import { stepsFor } from "@/features/actions/tx/tx-progress";
import { useTxProgress } from "@/features/actions/tx/use-tx-progress";
import { useTxTracker } from "@/features/actions/tx/use-tx-tracker";
import { useActiveChain } from "@/features/chain/ChainProvider";
import { type GenerateClaimLinkResult, generateClaimLink } from "@/features/claim-link/claimLink";
import { useWallet } from "@/features/wallet";
import { useInvalidateWalletState } from "@/features/wallet/use-wallet-state";
import { toastError } from "@/shared/lib/toast";

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
      return generateClaimLink(wallet, {
        amount: i.amount,
        asset: i.asset,
        chainId: chain.chainId,
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
  return { mutation, progress: progressView(progress) };
}
