import { useActiveChain } from "@/features/chain";
import { type GenerateClaimLinkResult, generateClaimLink, linkProbe } from "@/features/claim-links";
import { type ActionMutation, type GenerateLinkCall, useWalletTransfer } from "@/features/ops";
import type { Step } from "@/features/tx";
import { useSession } from "@/features/wallet";
import type { RelayerFeeTerms } from "@/shared/domain/relayer-fee";

export type GenerateLinkRequest = GenerateLinkCall & RelayerFeeTerms;

/// The wait before the spend: each candidate address is scanned for an earlier link's funds.
const RESERVING: Step = {
  id: "reserving",
  label: "Reserve an address for the link",
  activeLabel: "Reserving an address for the link",
  doneLabel: "Reserved an address for the link",
  detail: "Checking that no earlier link used this address.",
};

/// The claim-link mutation: a transfer to an ephemeral wallet built for the link.
export function useGenerateLink(): ActionMutation<GenerateLinkRequest, GenerateClaimLinkResult> {
  const chain = useActiveChain();
  const { layer } = useSession();
  return useWalletTransfer({
    key: "claim-link",
    label: "claim link",
    failed: "claim link failed",
    lead: RESERVING,
    // `ctx.currentChainId` rechecks the chain before spending, or the link could name the wrong pool.
    run: async (wallet, i, ctx) => {
      if (!layer) throw new Error("wallet not ready");
      return generateClaimLink(wallet, { ...i, ...ctx, probe: linkProbe(layer, chain) });
    },
  });
}
