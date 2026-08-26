import { type EvmAddress, evmAddress } from "@lelantos-org/sdk";
import type { WalletApi } from "@lelantos-org/sdk/wallet";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useActiveChain } from "@/features/chain";
import { useWallet } from "@/features/wallet";
import { BALANCE_POLL_MS, BALANCE_STALE_MS, usePolling } from "@/shared/lib/activity";
import { createLogger } from "@/shared/lib/logger";
import { useRegisteredAssets } from "./registered-assets";

const log = createLogger("balances:transparent");

/// Prefix shared by every per-asset entry; invalidating it covers them all.
export const transparentBalancesKey = (chainId: bigint | undefined, account: string | undefined) =>
  ["transparent-balances", chainId?.toString() ?? null, account ?? null] as const;

const sourceBalanceKey = (
  chainId: bigint | undefined,
  account: string | undefined,
  assetId: bigint | undefined,
  asEth: boolean,
) =>
  [
    ...transparentBalancesKey(chainId, account),
    asEth ? "native" : (assetId?.toString() ?? null),
  ] as const;

/// Chain reads, both reporting an unavailable balance as `undefined`.
///
/// Not `0n`: this module and `validateDepositAmount`, which skips the check on
/// `undefined`, treat it as "not known". Collapsing a failed read to zero would
/// assert the user holds nothing, rejecting every amount as exceeding the
/// balance until the poll recovered, and would hide a missing adapter entry
/// point.
type Chain = WalletApi["chain"];
/// Derived from the adapter signature, so a change there surfaces here rather
/// than at the call site.
type TokenRef = Parameters<NonNullable<Chain["tokenBalanceOf"]>>[0];

/// `null` rather than `undefined`, which React Query rejects as a query result.
/// The hook maps it back to `undefined` at its boundary, the spelling the rest of
/// the app uses for "not known".
function readNative(chain: Chain, account: EvmAddress): Promise<bigint | null> {
  const read = chain.nativeBalance;
  if (!read) return Promise.resolve(null);
  return read.call(chain, account).catch((e: unknown) => {
    log.warn("native balance read failed", e);
    return null;
  });
}

function readToken(chain: Chain, token: TokenRef, account: EvmAddress): Promise<bigint | null> {
  const read = chain.tokenBalanceOf;
  if (!read) return Promise.resolve(null);
  return read.call(chain, token, account).catch((e: unknown) => {
    log.warn("token balance read failed", e);
    return null;
  });
}

/// The balance a deposit of this asset draws on, in token base units.
///
/// `asEth` wraps native coin into WETH before escrowing, so the funding source
/// is the native balance even though the selected asset is the ERC-20. Reading
/// the WETH balance there would validate against funds the user is not
/// spending.
///
/// `undefined` while the read is in flight, and also when it failed or the
/// adapter cannot answer, so callers distinguish "not yet known" from zero and do
/// not reject an amount against a balance they do not have.
///
/// Reads only the balance it returns, keyed per asset: selecting a different
/// asset costs one cold read and is cached thereafter.
export function useDepositSourceBalance(
  assetId: bigint | undefined,
  asEth: boolean,
): bigint | undefined {
  const { wallet, ethAddress } = useWallet();
  const { chainId } = useActiveChain();
  const assets = useRegisteredAssets();
  const token = asEth ? undefined : assets.find((a) => a.id === assetId)?.token;

  const { data } = useQuery<bigint | null>({
    queryKey: sourceBalanceKey(wallet ? chainId : undefined, ethAddress, assetId, asEth),
    enabled: !!wallet && !!ethAddress && (asEth || token !== undefined),
    queryFn: async () => {
      if (!wallet || !ethAddress) throw new Error("not ready");
      const account = evmAddress(ethAddress);
      if (asEth) return readNative(wallet.chain, account);
      if (token === undefined) throw new Error("not ready");
      return readToken(wallet.chain, token, account);
    },
    // Through `usePolling` like every other poll: this one sends the user's EOA
    // to a third-party RPC on each tick, so an unattended tab must not keep
    // announcing that address at full cadence.
    ...usePolling(BALANCE_POLL_MS),
    staleTime: BALANCE_STALE_MS,
  });

  return data ?? undefined;
}

/// Drop every cached source balance for the active wallet.
///
/// Called after a deposit, the one action that moves funds out of the transparent
/// balance. `BALANCE_STALE_MS` would otherwise hold the pre-deposit figure on
/// screen.
export function useInvalidateTransparentBalances(): () => Promise<void> {
  const qc = useQueryClient();
  const { wallet, ethAddress } = useWallet();
  const { chainId } = useActiveChain();
  return useCallback(
    () =>
      qc.invalidateQueries({
        queryKey: transparentBalancesKey(wallet ? chainId : undefined, ethAddress),
      }),
    [qc, wallet, chainId, ethAddress],
  );
}
