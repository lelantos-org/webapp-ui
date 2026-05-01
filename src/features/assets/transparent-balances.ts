import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useRegisteredAssets } from "@/features/assets/registered-assets";
import { useWallet } from "@/features/wallet";

/// One row of a user's on-chain (unshielded) holdings.
export type TransparentBalance =
  | {
      kind: "native";
      symbol: "ETH";
      decimals: 18;
      /// Wei.
      balance: bigint;
    }
  | {
      kind: "erc20";
      id: bigint;
      symbol: string;
      decimals: number;
      /// Token base units.
      balance: bigint;
    };

const POLL_MS = 30_000;

export const transparentBalancesKey = (chainId: bigint | undefined, account: string | undefined) =>
  ["transparent-balances", chainId?.toString() ?? null, account ?? null] as const;

/// Reads native-ETH balance + every registered ERC-20's `balanceOf` in
/// parallel. Adapters without `tokenBalanceOf` / `nativeBalance` yield `0n` silently.
export function useTransparentBalances(): UseQueryResult<TransparentBalance[]> {
  const { wallet, ethAddress } = useWallet();
  const assets = useRegisteredAssets();

  return useQuery<TransparentBalance[]>({
    queryKey: transparentBalancesKey(wallet ? BigInt(0) : undefined, ethAddress),
    enabled: !!wallet && !!ethAddress && !!assets.data,
    queryFn: async () => {
      if (!wallet || !ethAddress || !assets.data) throw new Error("not ready");
      const chain = wallet.chain;
      const eth = chain.nativeBalance ? await chain.nativeBalance(ethAddress).catch(() => 0n) : 0n;
      const tokenRead = chain.tokenBalanceOf;
      const erc20Rows: TransparentBalance[] = await Promise.all(
        assets.data.map(async (a) => ({
          kind: "erc20" as const,
          id: a.id,
          symbol: a.symbol,
          decimals: a.decimals,
          balance: tokenRead
            ? await tokenRead.call(chain, a.token, ethAddress).catch(() => 0n)
            : 0n,
        })),
      );
      const rows: TransparentBalance[] = [
        { kind: "native", symbol: "ETH", decimals: 18, balance: eth },
        ...erc20Rows,
      ];
      return rows;
    },
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
}
