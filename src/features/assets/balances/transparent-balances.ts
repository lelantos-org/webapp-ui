import { type EvmAddress, evmAddress, type TokenAmount, type WalletApi } from "@lelantos-org/sdk";
import {
  queryOptions,
  skipToken,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import type { RegisteredAsset } from "@/config/chains";
import { useActiveChain } from "@/features/chain";
import { useWallet } from "@/features/wallet";
import { asBaseUnits } from "@/shared/domain/units";
import { createLogger } from "@/shared/lib/logger";
import { BALANCE_POLL_MS, BALANCE_STALE_MS, usePolling } from "@/shared/query/cadence";
import { queryKeys } from "@/shared/query/keys";
import { useRegisteredAssets } from "../registry/registered-assets";

const log = createLogger("balances:transparent");

type Chain = WalletApi["chain"];
type TokenRef = Parameters<NonNullable<Chain["tokenBalanceOf"]>>[0];

/// `null` means unknown (React Query rejects `undefined`); never `0n`, which rejects every amount.
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

function sourceBalanceQuery(
  { wallet, ethAddress }: Pick<ReturnType<typeof useWallet>, "wallet" | "ethAddress">,
  chainId: bigint,
  assets: readonly RegisteredAsset[],
  { assetId, asEth }: { assetId: bigint | undefined; asEth: boolean },
) {
  const token = asEth ? undefined : assets.find((a) => a.id === assetId)?.token;
  const queryFn: (() => Promise<bigint | null>) | typeof skipToken =
    !wallet || !ethAddress || (!asEth && token === undefined)
      ? skipToken
      : asEth
        ? () => readNative(wallet.chain, evmAddress(ethAddress))
        : () => readToken(wallet.chain, token!, evmAddress(ethAddress));
  return queryOptions({
    queryKey: queryKeys.sourceBalance(wallet ? chainId : undefined, ethAddress, assetId, asEth),
    queryFn,
    staleTime: BALANCE_STALE_MS,
  });
}

/// Balance a deposit of this asset draws on (native when `asEth`); `undefined` if unknown.
export function useDepositSourceBalance(
  assetId: bigint | undefined,
  asEth: boolean,
): TokenAmount | undefined {
  const { chainId } = useActiveChain();
  const { data } = useQuery({
    ...sourceBalanceQuery(useWallet(), chainId, useRegisteredAssets(), { assetId, asEth }),
    // Through `usePolling`: each tick sends the user's EOA to a third-party RPC.
    ...usePolling(BALANCE_POLL_MS),
  });

  return data === undefined || data === null ? undefined : asBaseUnits(data);
}

/// One Shield picker entry: a registered asset, or native coin via one of its WETH ids.
export interface SourceBalanceRef {
  assetId: bigint;
  asEth: boolean;
}

/// `useDepositSourceBalance` per ref. Each read leaks the EOA to the RPC: mount only while picking.
export function useDepositSourceBalances(
  refs: readonly SourceBalanceRef[],
): (bigint | undefined)[] {
  const wallet = useWallet();
  const { chainId } = useActiveChain();
  const assets = useRegisteredAssets();

  return useQueries({
    queries: refs.map((ref) => sourceBalanceQuery(wallet, chainId, assets, ref)),
    combine: (results) => results.map((r) => r.data ?? undefined),
  });
}

/// Public ERC-20 balances keyed by asset id, one read per token, no polling; unknown has no entry.
export function usePublicBalances(assetIds: readonly bigint[]): ReadonlyMap<bigint, TokenAmount> {
  const readOf = oneReadPerToken(assetIds, useRegisteredAssets());
  const readIds = [...new Set(readOf.values())];
  const values = useDepositSourceBalances(readIds.map((assetId) => ({ assetId, asEth: false })));

  const out = new Map<bigint, TokenAmount>();
  for (const [id, read] of readOf) {
    const v = values[readIds.indexOf(read)];
    if (v !== undefined) out.set(id, asBaseUnits(v));
  }
  return out;
}

function oneReadPerToken(
  ids: readonly bigint[],
  assets: readonly RegisteredAsset[],
): Map<bigint, bigint> {
  const firstByToken = new Map<string, bigint>();
  const readOf = new Map<bigint, bigint>();
  for (const id of ids) {
    const token = assets.find((a) => a.id === id)?.token.toLowerCase() ?? `#${id}`;
    const first = firstByToken.get(token) ?? id;
    firstByToken.set(token, first);
    readOf.set(id, first);
  }
  return readOf;
}

/// Invalidate every cached source balance for the active wallet, e.g. after a deposit.
export function useInvalidateTransparentBalances(): () => Promise<void> {
  const qc = useQueryClient();
  const { wallet, ethAddress } = useWallet();
  const { chainId } = useActiveChain();
  return useCallback(
    () =>
      qc.invalidateQueries({
        queryKey: queryKeys.transparentBalances(wallet ? chainId : undefined, ethAddress),
      }),
    [qc, wallet, chainId, ethAddress],
  );
}
