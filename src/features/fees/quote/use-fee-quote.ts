import type { FeeOption, FeeQuote } from "@lelantos-org/sdk";
import { keepPreviousData, skipToken, type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useActiveChain } from "@/features/chain";
import { useWalletInstance } from "@/features/wallet";
import type { FeeKind } from "@/shared/domain/op-kind";
import type { AssetLabel, AssetUnits } from "@/shared/domain/units";
import { queryKeys } from "@/shared/query/keys";

export type { FeeOption, FeeQuote };

/// The relayer's amount-independent fee quote for `kind`, one option per accepted asset.
export function useFeeQuote(kind: FeeKind): UseQueryResult<FeeQuote> {
  const wallet = useWalletInstance();
  const { chainId } = useActiveChain();

  return useQuery<FeeQuote>({
    queryKey: queryKeys.feeQuote(chainId, wallet?.address, kind),
    queryFn: wallet ? () => wallet.quoteFee(kind) : skipToken,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/// The option paying in `asset`, or `undefined` when the relayer will not accept it.
export function feeOptionFor(
  quote: FeeQuote | undefined,
  asset: bigint | undefined,
): FeeOption | undefined {
  if (!quote || asset === undefined) return undefined;
  return quote.options.find((o) => o.asset.id === asset);
}

type RegistryEntry = AssetUnits & AssetLabel & { id: bigint };

/// A relayer fee option joined to the registry entry for its asset, or `undefined` if unknown.
export function resolveFeeOption(
  option: FeeOption | undefined,
  registry: readonly RegistryEntry[],
): { amount: bigint; asset: AssetUnits & AssetLabel } | undefined {
  if (!option) return undefined;
  const entry = registry.find((a) => a.id === option.asset.id);
  if (!entry) return undefined;
  return {
    amount: option.amount,
    // `index` must travel with `scale`, or a yield-asset fee prints smaller than the one taken.
    asset: {
      symbol: entry.symbol,
      decimals: entry.decimals,
      scale: entry.scale,
      index: entry.index,
      token: entry.token,
    },
  };
}
