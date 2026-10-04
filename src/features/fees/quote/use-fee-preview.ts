import { skipToken, type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useActiveChain } from "@/features/chain";
import { useWalletInstance } from "@/features/wallet";
import { type FeeBreakdown, feeBreakdown } from "@/shared/domain/fee-math";
import type { FeeLeg } from "@/shared/domain/op-kind";
import { queryKeys } from "@/shared/query/keys";
import { type AssetFeeInputs, fetchAssetFeeInputs } from "./asset-fee-inputs";

/// The protocol fee on the amount typed: `data` is `undefined` until the asset's rate is read.
export interface FeePreview {
  data: FeeBreakdown | undefined;
  /// The asset's rate could not be read.
  isError: boolean;
  refetch(): void;
}

/// What the protocol fee on `asset` is computed from. It does not depend on the amount, so it is
/// read once per asset and leg; the yield index moves, hence the short stale time.
function useAssetFeeInputs(asset: bigint | undefined, leg: FeeLeg): UseQueryResult<AssetFeeInputs> {
  const wallet = useWalletInstance();
  const { chainId } = useActiveChain();
  return useQuery<AssetFeeInputs>({
    queryKey: queryKeys.feeInputs(chainId, asset, leg),
    queryFn:
      wallet && asset !== undefined ? () => fetchAssetFeeInputs(wallet, asset, leg) : skipToken,
    staleTime: 30_000,
    // The callers read three fields; `isFetching` flips must not re-render the form.
    notifyOnChangeProps: ["data", "isError"],
  });
}

/// The protocol fee for `amount` of `asset` on `leg`. The fee is arithmetic on the asset's rate,
/// so it follows the amount as it is typed, with no request per keystroke.
export function useFeePreview(
  asset: bigint | undefined,
  amount: bigint | undefined,
  leg: FeeLeg,
): FeePreview {
  const { data: inputs, isError, refetch } = useAssetFeeInputs(asset, leg);
  const data = useMemo(
    () =>
      inputs && amount !== undefined && amount > 0n
        ? feeBreakdown({
            amount,
            scale: inputs.scale,
            feeBps: inputs.feeBps,
            leg,
            index: inputs.index,
          })
        : undefined,
    [inputs, amount, leg],
  );
  const retry = useCallback(() => void refetch(), [refetch]);
  return useMemo(() => ({ data, isError, refetch: retry }), [data, isError, retry]);
}

/// One asset's protocol fee rate for `leg`, in basis points.
export function useAssetFeeBps(asset: bigint | undefined, leg: FeeLeg): bigint | undefined {
  return useAssetFeeInputs(asset, leg).data?.feeBps;
}

/// A protocol-fee figure is still on its way and has not failed.
export function feeIncoming(fee: FeePreview): boolean {
  return fee.data === undefined && !fee.isError;
}
