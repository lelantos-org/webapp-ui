import type { WalletApi } from "@lelantos-org/sdk";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/query/keys";

/// The address `wallet` publishes under its handle. Not `wallet.address`: the wallet hands this
/// one out nowhere else. A function of the account alone, so it never goes stale.
export function usePublishedAddress(
  chainId: bigint,
  wallet: Pick<WalletApi, "address" | "publishedAddress">,
): UseQueryResult<string> {
  return useQuery<string>({
    queryKey: queryKeys.publishedAddress(chainId, wallet.address),
    queryFn: () => wallet.publishedAddress(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
