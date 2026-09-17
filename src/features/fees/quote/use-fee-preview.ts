import { keepPreviousData, skipToken, type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useActiveChain } from "@/features/chain";
import { useWalletInstance } from "@/features/wallet";
import { type FeeBreakdown, feeBreakdown } from "@/shared/domain/fee-math";
import type { FeeLeg } from "@/shared/domain/op-kind";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import { queryKeys } from "@/shared/query/keys";
import { fetchAssetFeeInputs } from "./asset-fee-inputs";

const DEBOUNCE_MS = 300;

/// The fee query plus `stale`: `data` is for a different amount than the one typed.
/// Submit gates must treat a stale figure as absent (`settledFee`); displays need not (`shownFee`).
export type FeePreviewResult = UseQueryResult<FeeBreakdown> & { stale: boolean };

/// The debounced protocol fee for `amount` of `asset` on `leg`.
export function useFeePreview(
  asset: bigint | undefined,
  amount: bigint | undefined,
  leg: FeeLeg,
): FeePreviewResult {
  const wallet = useWalletInstance();
  const { chainId } = useActiveChain();
  const settled = useDebouncedValue(amount, DEBOUNCE_MS);

  const query = useQuery<FeeBreakdown>({
    queryKey: queryKeys.feePreview(chainId, leg, asset, settled),
    queryFn:
      wallet && asset !== undefined && settled !== undefined && settled > 0n
        ? async () => {
            const { scale, feeBps, index } = await fetchAssetFeeInputs(wallet, asset, leg);
            return feeBreakdown({ amount: settled, scale, feeBps, leg, index });
          }
        : skipToken,
    staleTime: 30_000,
    gcTime: 60_000,
    placeholderData: keepPreviousData,
    // Spreading the result would otherwise subscribe to every prop and re-render on each `isFetching` flip.
    notifyOnChangeProps: ["data", "isError", "isPlaceholderData"],
  });

  const stale = settled !== amount || query.isPlaceholderData;
  return useMemo(() => ({ ...query, stale }) as FeePreviewResult, [query, stale]);
}

/// One asset's protocol fee rate for `leg`, in basis points. Amount-independent, so cached longer.
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

/// The preview's data, or `undefined` while stale. Use this to gate a submit.
export function settledFee(fee: FeePreviewResult): FeeBreakdown | undefined {
  return fee.stale ? undefined : fee.data;
}

/// The preview's data for display, including held-over figures. Never gate a submit on it.
export function shownFee(fee: FeePreviewResult): FeeBreakdown | undefined {
  return fee.data;
}

/// A protocol-fee figure is still on its way and has not failed.
export function feeIncoming(fee: FeePreviewResult): boolean {
  return fee.data === undefined && !fee.isError;
}
