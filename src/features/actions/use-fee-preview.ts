// Compute the on-chain fee + totals for a `(asset, amount)` pair so the
// form can render "you'll pay X / receive Y" before the user submits.
// Cached per (asset, amount, mode) via react-query.

import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchAssetFeeInputs } from "@/features/assets/asset-entry";
import { useActiveChain } from "@/features/chain/ChainProvider";
import { useWallet } from "@/features/wallet";
import { type FeeBreakdown, type FeeMode, feeBreakdown } from "@/shared/lib/fees";
import { useDebouncedValue } from "@/shared/lib/use-debounced-value";

export type { FeeMode };
export type FeePreview = FeeBreakdown;

const DEFAULT_MODE: FeeMode = "deposit";

/// The forms feed this directly from the amount input. Without a debounce each
/// keystroke issues two chain reads and occupies its own cache entry.
const DEBOUNCE_MS = 300;

/// The query result plus `stale`: true while the debounce is catching up with
/// `amount`.
///
/// While `stale` is set, `data` describes an earlier amount. Callers gating a
/// submit — validation, the approval probe — must treat it as absent, or the
/// button becomes live against the fee for a different amount.
///
/// An intersection rather than `interface extends`: `UseQueryResult` is a
/// discriminated union over the loading, error and success states, which
/// extending would collapse.
export type FeePreviewResult = UseQueryResult<FeePreview> & { stale: boolean };

export function useFeePreview(
  asset: bigint | undefined,
  amount: bigint | undefined,
  mode: FeeMode = DEFAULT_MODE,
): FeePreviewResult {
  const { wallet } = useWallet();
  // Asset ids are only unique within a chain, and `feeBps` is read from that
  // chain's pool, so the same (asset, amount) means different money elsewhere.
  const { chainId } = useActiveChain();
  const settled = useDebouncedValue(amount, DEBOUNCE_MS);
  const stale = settled !== amount;

  const query = useQuery<FeePreview>({
    queryKey: [
      "fee-preview",
      chainId.toString(),
      mode,
      asset?.toString() ?? null,
      settled?.toString() ?? null,
    ],
    enabled: !!wallet && asset !== undefined && settled !== undefined && settled > 0n,
    queryFn: async () => {
      if (!wallet || asset === undefined || settled === undefined) {
        throw new Error("not ready");
      }
      const { scale, feeBps } = await fetchAssetFeeInputs(wallet, asset);
      return feeBreakdown({ amount: settled, scale, feeBps, mode });
    },
    staleTime: 30_000,
    // Each distinct amount is its own key, so intermediate entries would
    // otherwise be retained for the 5 minute default.
    gcTime: 60_000,
  });

  return useMemo(() => ({ ...query, stale }) as FeePreviewResult, [query, stale]);
}

/// The pool's protocol fee, in basis points.
///
/// Chain-wide rather than per-asset (`MASP.feeBps()`), so it is keyed on the
/// chain alone and shared by every consumer. Separate from `useFeePreview`,
/// which is about one amount and is debounced against the amount field.
export function useFeeBps(): bigint | undefined {
  const { wallet } = useWallet();
  const { chainId } = useActiveChain();
  const { data } = useQuery<bigint>({
    queryKey: ["fee-bps", chainId.toString()],
    enabled: !!wallet,
    queryFn: async () => {
      if (!wallet) throw new Error("not ready");
      return wallet.chain.fetchFeeBps();
    },
    staleTime: 5 * 60_000,
  });
  return data;
}
