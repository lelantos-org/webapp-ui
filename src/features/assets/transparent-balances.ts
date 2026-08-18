import { type EvmAddress, evmAddress } from "@lelantos-org/sdk";
import type { WalletApi } from "@lelantos-org/sdk/wallet";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useRegisteredAssets } from "@/features/assets/registered-assets";
import { useActiveChain } from "@/features/chain/ChainProvider";
import { useWallet } from "@/features/wallet";
import { createLogger } from "@/shared/lib/logger";

const log = createLogger("balances:transparent");

const POLL_MS = 30_000;

/// Window in which a remount reuses the cached balance instead of re-reading
/// the chain.
///
/// `DepositForm` is the index route, so navigating between forms remounts this
/// query repeatedly. Deposits invalidate explicitly via
/// `useInvalidateTransparentBalances`, so the window cannot mask a balance the
/// user has just changed.
const STALE_MS = 10_000;

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
/// Not `0n`. The rest of this module — and `validateDepositAmount`, which skips
/// the check entirely on `undefined` — is built on "undefined means not known".
/// Collapsing a failed read to zero instead asserts the user holds nothing, so
/// every amount came back "exceeds available balance" and the deposit button
/// stayed dead until the poll recovered, blaming the balance rather than the
/// read. It also hid a genuinely missing adapter entrypoint.
type Chain = WalletApi["chain"];
/// Derived from the adapter signature, so a change to it surfaces here rather
/// than at the call site.
type TokenRef = Parameters<NonNullable<Chain["tokenBalanceOf"]>>[0];

/// `null`, not `undefined`: React Query rejects an `undefined` query result
/// outright. The hook maps it back to `undefined` at its boundary, which is the
/// spelling the rest of the app uses for "not known".
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
/// adapter cannot answer — callers distinguish "not yet known" from "zero" and
/// avoid rejecting an amount against a balance they do not have.
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
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: STALE_MS,
  });

  return data ?? undefined;
}

/// Drop every cached source balance for the active wallet.
///
/// Called after a deposit, the one action that moves funds out of the
/// transparent balance; `STALE_MS` would otherwise hold the pre-deposit figure
/// on screen.
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
