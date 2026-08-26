// Compute the on-chain fee + totals for a `(asset, amount)` pair so the
// form can render "you'll pay X / receive Y" before the user submits.
// Cached per (asset, amount, mode) via react-query.

import { keepPreviousData, type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchAssetFeeInputs } from "@/features/assets";
import { useActiveChain } from "@/features/chain";
import { useWallet } from "@/features/wallet";
import { type FeeBreakdown, type FeeMode, feeBreakdown } from "@/shared/lib/fees";
import { useDebouncedValue } from "@/shared/lib/use-debounced-value";

export type { FeeMode };
export type FeePreview = FeeBreakdown;

const DEFAULT_MODE: FeeMode = "deposit";

/// The forms feed this directly from the amount input. Without a debounce each
/// keystroke issues two chain reads and occupies its own cache entry.
const DEBOUNCE_MS = 300;

/// The query result plus `stale`: true whenever `data` describes an amount
/// other than the one currently typed.
///
/// Two ways that happens, and both have to be covered: the debounce has not
/// caught up with `amount` yet, or it has and the query for the new amount is
/// still in flight, holding the previous one's answer (`keepPreviousData`).
///
/// Callers gating a submit — validation, the approval probe — must treat a
/// stale figure as absent, or the button becomes live against the fee for a
/// different amount. Callers merely *displaying* it should not: see
/// `shownFee`.
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
    // Every settled amount is a new key, so without this the fee blanks on each
    // edit and the panel reads as broken between keystrokes. The figure held
    // over describes the previous amount — which is exactly what `stale` above
    // already says, and what callers gating a submit already have to honour.
    placeholderData: keepPreviousData,
  });

  // `isPlaceholderData` is the second half of it: the debounce has settled, but
  // the query for the settled amount has not, so `data` is still the previous
  // amount's.
  const stale = settled !== amount || query.isPlaceholderData;
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
