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
/// Derived from the adapter signature, so a change there surfaces here rather
/// than at the call site.
type TokenRef = Parameters<NonNullable<Chain["tokenBalanceOf"]>>[0];

// Chain reads, both reporting an unavailable balance as `undefined`.
//
// Not `0n`: this module and `validateDepositAmount`, which skips the check on
// `undefined`, treat it as "not known". Collapsing a failed read to zero would
// assert the user holds nothing, rejecting every amount as exceeding the
// balance until the poll recovered, and would hide a missing adapter entry
// point.

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

/// The query behind one source balance, spelled once for the single-asset hook
/// and the picker's list, so both fill the same cache entry the same way. Skipped
/// until there is an account to read and — off the native path — a token to read
/// it in.
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
): TokenAmount | undefined {
  const { chainId } = useActiveChain();
  const { data } = useQuery({
    ...sourceBalanceQuery(useWallet(), chainId, useRegisteredAssets(), { assetId, asEth }),
    // Through `usePolling` like every other poll: this one sends the user's EOA
    // to a third-party RPC on each tick, so an unattended tab must not keep
    // announcing that address at full cadence.
    ...usePolling(BALANCE_POLL_MS),
  });

  // Chain reads of an ERC-20 or native balance: base units by definition.
  return data === undefined || data === null ? undefined : asBaseUnits(data);
}

/// One entry the Shield picker lists: a registered asset, or native coin paid
/// through one of its WETH ids.
export interface SourceBalanceRef {
  assetId: bigint;
  asEth: boolean;
}

/// `useDepositSourceBalance` for a whole list at once, in the order given.
///
/// For the Shield picker's "You hold" column, and only while it is open: this is
/// an RPC read per registered token, each announcing the user's EOA to a
/// third-party RPC, which is exactly the cost `asset-option.ts` declined to pay
/// on every render of a `<select>`. The picker mounts only while the user is
/// actually choosing.
///
/// Shares keys and query functions with the single-asset hook, so the picker
/// and the form reuse each other's cache — the selected asset is never read
/// twice — and every native-coin entry resolves to the one native read.
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

/// Public ERC-20 balances of several assets, in token base units, keyed by asset
/// id. An asset whose read has not answered, or failed, has no entry: unknown,
/// not zero, as everywhere in this module.
///
/// For a deposit's relayer fee, which may be paid from a token other than the one
/// being shielded: the caller passes only the assets it can be paid in, and none
/// while there is no charge to judge. Does not poll, for the privacy cost
/// `useDepositSourceBalances` describes.
///
/// One read per token rather than per id: a plain id and a yield id over one
/// ERC-20 hold one balance, and each read announces the user's EOA. The first id
/// naming a token is the one read, under the key the other hooks here use for
/// it, so a caller listing the deposited asset first reuses the form's own read.
export function usePublicBalances(assetIds: readonly bigint[]): ReadonlyMap<bigint, TokenAmount> {
  const readOf = oneReadPerToken(assetIds, useRegisteredAssets());
  const readIds = [...new Set(readOf.values())];
  const values = useDepositSourceBalances(readIds.map((assetId) => ({ assetId, asEth: false })));

  const out = new Map<bigint, TokenAmount>();
  for (const [id, read] of readOf) {
    const v = values[readIds.indexOf(read)];
    // Chain reads of an ERC-20 balance: base units by definition.
    if (v !== undefined) out.set(id, asBaseUnits(v));
  }
  return out;
}

/// Each id mapped to the id whose read answers it: the first one naming its
/// token. An id the registry does not resolve answers for itself, and its read
/// is skipped (`sourceBalanceQuery`).
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
        queryKey: queryKeys.transparentBalances(wallet ? chainId : undefined, ethAddress),
      }),
    [qc, wallet, chainId, ethAddress],
  );
}
