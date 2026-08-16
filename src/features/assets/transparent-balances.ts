import { evmAddress } from "@lelantos-org/sdk";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useRegisteredAssets } from "@/features/assets/registered-assets";
import { useActiveChain } from "@/features/chain/ChainProvider";
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
  const { chainId } = useActiveChain();
  const assets = useRegisteredAssets();

  return useQuery<TransparentBalance[]>({
    queryKey: transparentBalancesKey(wallet ? chainId : undefined, ethAddress),
    enabled: !!wallet && !!ethAddress && assets.length > 0,
    queryFn: async () => {
      if (!wallet || !ethAddress) throw new Error("not ready");
      const chain = wallet.chain;
      const account = evmAddress(ethAddress);
      const eth = chain.nativeBalance ? await chain.nativeBalance(account).catch(() => 0n) : 0n;
      const tokenRead = chain.tokenBalanceOf;
      const erc20Rows: TransparentBalance[] = await Promise.all(
        assets.map(async (a) => ({
          kind: "erc20" as const,
          id: a.id,
          symbol: a.symbol,
          decimals: a.decimals,
          balance: tokenRead ? await tokenRead.call(chain, a.token, account).catch(() => 0n) : 0n,
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

/// The balance a deposit of this asset actually draws on, in token base units.
///
/// `asEth` wraps native coin into WETH before escrowing, so the funding source
/// is the native balance even though the selected asset is the ERC-20 — reading
/// the WETH row there would validate against a balance the user is not spending.
///
/// `undefined` while the read is in flight, so callers can tell "not known yet"
/// from "zero" and avoid rejecting an amount before the balance has loaded.
export function useDepositSourceBalance(
  assetId: bigint | undefined,
  asEth: boolean,
): bigint | undefined {
  const { data } = useTransparentBalances();
  if (!data) return undefined;
  if (asEth) return data.find((r) => r.kind === "native")?.balance;
  if (assetId === undefined) return undefined;
  return data.find((r) => r.kind === "erc20" && r.id === assetId)?.balance;
}
