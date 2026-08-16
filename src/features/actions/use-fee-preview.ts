// Compute the on-chain fee + totals for a `(asset, amount)` pair so the
// form can render "you'll pay X / receive Y" before the user submits.
// Cached per (asset, amount, mode) via react-query.

import { useQuery } from "@tanstack/react-query";
import { fetchAssetFeeInputs } from "@/features/assets/asset-entry";
import { useActiveChain } from "@/features/chain/ChainProvider";
import { useWallet } from "@/features/wallet";
import { type FeeBreakdown, type FeeMode, feeBreakdown } from "@/shared/lib/fees";

export type { FeeMode };
export type FeePreview = FeeBreakdown;

const DEFAULT_MODE: FeeMode = "deposit";

export function useFeePreview(
  asset: bigint | undefined,
  amount: bigint | undefined,
  mode: FeeMode = DEFAULT_MODE,
) {
  const { wallet } = useWallet();
  // Asset ids are only unique within a chain, and `feeBps` is read from that
  // chain's pool, so the same (asset, amount) means different money elsewhere.
  const { chainId } = useActiveChain();
  return useQuery<FeePreview>({
    queryKey: [
      "fee-preview",
      chainId.toString(),
      mode,
      asset?.toString() ?? null,
      amount?.toString() ?? null,
    ],
    enabled: !!wallet && asset !== undefined && amount !== undefined && amount > 0n,
    queryFn: async () => {
      if (!wallet || asset === undefined || amount === undefined) {
        throw new Error("not ready");
      }
      const { scale, feeBps } = await fetchAssetFeeInputs(wallet, asset);
      return feeBreakdown({ amount, scale, feeBps, mode });
    },
    staleTime: 30_000,
  });
}
