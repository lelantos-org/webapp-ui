// Computes the on-chain fee and totals for an `(asset, amount)` pair, so a form
// can state what will be paid or received before submit. Cached per
// `(asset, amount, mode)` via react-query.

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

/// The forms feed this directly from the amount input. Without a debounce, each
/// keystroke issues two chain reads and occupies its own cache entry.
const DEBOUNCE_MS = 300;

/// The query result plus `stale`: true whenever `data` describes an amount
/// other than the one currently typed.
///
/// Two cases produce it: the debounce has not caught up with `amount`, or it has
/// and the query for the new amount is still in flight while `keepPreviousData`
/// holds the previous answer.
///
/// Callers gating a submit — validation, the approval probe — must treat a stale
/// figure as absent, or the button goes live against the fee for a different
/// amount. Callers only displaying it should not; see `shownFee`.
///
/// An intersection rather than `interface extends`, because `UseQueryResult` is
/// a discriminated union over the loading, error and success states, which
/// extending would collapse.
export type FeePreviewResult = UseQueryResult<FeePreview> & { stale: boolean };

export function useFeePreview(
  asset: bigint | undefined,
  amount: bigint | undefined,
  mode: FeeMode = DEFAULT_MODE,
): FeePreviewResult {
  const { wallet } = useWallet();
  // Asset ids are unique only within a chain, and the rate is read from that
  // chain's pool, so the same `(asset, amount)` denotes a different value
  // elsewhere. `mode` is in the key too: the two legs are priced apart.
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
      const { scale, feeBps, index } = await fetchAssetFeeInputs(wallet, asset, mode);
      return feeBreakdown({ amount: settled, scale, feeBps, mode, index });
    },
    staleTime: 30_000,
    // Each distinct amount is its own key, so intermediate entries would
    // otherwise be retained for the five-minute default.
    gcTime: 60_000,
    // Every settled amount is a new key, so without this the fee blanks on each
    // edit. The figure held over describes the previous amount, which is what
    // `stale` above reports and what callers gating a submit must honour.
    placeholderData: keepPreviousData,
    // Stated, because the result is spread into `FeePreviewResult` below and a
    // spread reads every property on react-query's tracking proxy — which
    // subscribes this observer to all of them, re-rendering the form on each
    // `isFetching` flip with the fee unchanged. These three are what is read:
    // `isPlaceholderData` here, `data` and `isError` by `fee-hint.ts` and
    // `use-deposit-amount.ts`. `refetch` is stable and needs no subscription.
    notifyOnChangeProps: ["data", "isError", "isPlaceholderData"],
  });

  // `isPlaceholderData` covers the second case: the debounce has settled but the
  // query for the settled amount has not, so `data` is still the previous
  // amount's.
  const stale = settled !== amount || query.isPlaceholderData;
  return useMemo(() => ({ ...query, stale }) as FeePreviewResult, [query, stale]);
}

/// One asset's protocol fee for one leg, in basis points.
///
/// Per asset and per leg: contracts 0.5.0 replaced the pool-wide `MASP.feeBps()`
/// with rates carried on the registry entry, so this is keyed on the asset as
/// well as the chain. Separate from `useFeePreview`, which concerns one amount
/// and is debounced against the amount field; this one is amount-independent and
/// so is cached for longer.
export function useAssetFeeBps(asset: bigint | undefined, mode: FeeMode): bigint | undefined {
  const { wallet } = useWallet();
  const { chainId } = useActiveChain();
  const { data } = useQuery<bigint>({
    queryKey: ["fee-bps", chainId.toString(), asset?.toString() ?? null, mode],
    enabled: !!wallet && asset !== undefined,
    queryFn: async () => {
      if (!wallet || asset === undefined) throw new Error("not ready");
      return (await fetchAssetFeeInputs(wallet, asset, mode)).feeBps;
    },
    staleTime: 5 * 60_000,
  });
  return data;
}
