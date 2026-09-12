// Computes the on-chain fee and totals for an `(asset, amount)` pair, so a form
// can state what will be paid or received before submit. Cached per
// `(asset, amount, leg)` via react-query.

import { assetId, type EvmAddress, type WalletApi } from "@lelantos-org/sdk";
import { keepPreviousData, skipToken, type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useActiveChain } from "@/features/chain";
import { useWalletInstance } from "@/features/wallet";
import { type FeeBreakdown, feeBreakdown } from "@/shared/domain/fee-math";
import type { FeeLeg } from "@/shared/domain/op-kind";
import { useDebouncedValue } from "@/shared/lib/use-debounced-value";
import { queryKeys } from "@/shared/query/keys";

export type FeePreview = FeeBreakdown;

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
  leg: FeeLeg,
): FeePreviewResult {
  const wallet = useWalletInstance();
  // Asset ids are unique only within a chain, and the rate is read from that
  // chain's pool, so the same `(asset, amount)` denotes a different value
  // elsewhere. `leg` is in the key too: the two legs are priced apart.
  const { chainId } = useActiveChain();
  const settled = useDebouncedValue(amount, DEBOUNCE_MS);

  const query = useQuery<FeePreview>({
    queryKey: queryKeys.feePreview(chainId, leg, asset, settled),
    queryFn:
      wallet && asset !== undefined && settled !== undefined && settled > 0n
        ? async () => {
            const { scale, feeBps, index } = await fetchAssetFeeInputs(wallet, asset, leg);
            return feeBreakdown({ amount: settled, scale, feeBps, leg, index });
          }
        : skipToken,
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
    // `isPlaceholderData` here, `data` and `isError` by `shownFee`/`feeIncoming` below and
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
/// Per asset and per leg: rates are carried on the registry entry (there is no
/// pool-wide rate), so this is keyed on the asset as well as the chain. Separate from `useFeePreview`, which concerns one amount
/// and is debounced against the amount field; this one is amount-independent and
/// so is cached for longer.
export function useAssetFeeBps(asset: bigint | undefined, leg: FeeLeg): bigint | undefined {
  const wallet = useWalletInstance();
  const { chainId } = useActiveChain();
  const { data } = useQuery<bigint>({
    queryKey: queryKeys.feeBps(chainId, asset, leg),
    queryFn:
      wallet && asset !== undefined
        ? async () => (await fetchAssetFeeInputs(wallet, asset, leg)).feeBps
        : skipToken,
    staleTime: 5 * 60_000,
  });
  return data;
}

/// What a protocol-fee estimate reads from the asset registry.
export interface AssetFeeInputs {
  /// Circuit-units → base-units multiplier.
  scale: bigint;
  /// Protocol fee in basis points for the leg that was asked for.
  feeBps: bigint;
  /// ERC-20 backing this asset id.
  token: EvmAddress;
  /// Yield index, RAY-scaled; `RAY` for an asset held as plain custody.
  ///
  /// Carried with the rate because a fee is charged on a converted amount, and
  /// a yield asset's unit is worth `scale * index / RAY` rather than `scale`.
  /// Omitting it here understates what a deposit costs — and this figure sizes
  /// the Permit2 window, so an understatement is a deposit the pool cannot pull.
  index: bigint;
}

/// Read everything a fee estimate for `(asset, leg)` needs, in one round trip.
///
/// One call: the per-asset, per-leg rates come back with the entry from
/// `asset(id)`.
///
/// Goes through `wallet.asset` rather than `fetchAssetEntry`. Both read the same
/// registry row, but the wallet's resolution is cached for its lifetime and
/// applies `WalletConfig.feeBps`, so the raw chain read would issue a request
/// per `(asset, leg)` — and per settled amount, since `useFeePreview` keys on
/// it — and would state a rate the spend path does not use wherever a
/// deployment overrides one. `useAssetLadder` (`unshield/denominations/use-ladder.ts`)
/// reads the ladder through the wallet for the same reason.
///
/// `leg` is resolved here rather than handed back as a pair, so no caller ever
/// holds both rates and none can pair one leg's rate with the other's
/// direction — a mismatch that would misstate the fee silently, in whichever
/// direction the user notices.
export async function fetchAssetFeeInputs(
  wallet: WalletApi,
  asset: bigint,
  leg: FeeLeg,
): Promise<AssetFeeInputs> {
  const info = await wallet.asset(assetId(asset));
  return {
    scale: info.scale,
    feeBps: leg === "deposit" ? info.depositBps : info.withdrawBps,
    token: info.token,
    index: info.index,
  };
}

/// The preview's data, or `undefined` while the debounce is catching up.
///
/// During that window `data` describes the previous keystroke's amount, so a fee
/// for one amount is never shown against another. Deposit validation gates its
/// submit button on the same absence (`feeUnknown`).
export function settledFee(fee: FeePreviewResult): FeeBreakdown | undefined {
  return fee.stale ? undefined : fee.data;
}

/// The preview's data for display, including held-over figures.
///
/// The counterpart of `settledFee`: a panel showing the previous amount's figure
/// briefly reads as a number settling, where one blanking on every keystroke
/// reads as a failure. Never use this to gate a submit.
export function shownFee(fee: FeePreviewResult): FeeBreakdown | undefined {
  return fee.data;
}

/// Whether a protocol-fee figure is still on its way.
///
/// Lets the panel hold a line open rather than growing one when the figure lands.
/// True only while there is nothing to show and nothing has failed: a failed read
/// collapses the row so the retry notice can take over, rather than leaving a
/// placeholder that never resolves.
export function feeIncoming(fee: FeePreviewResult): boolean {
  return fee.data === undefined && !fee.isError;
}
