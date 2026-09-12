// The display balance: what the wallet holds, plus what is on its way.
//
// The composition is kept out of both halves. `useWalletState` answers only what
// this wallet has decrypted; the pending store in `features/tx` holds only what is
// in flight.
// Folding the overlay into the wallet would make `features/wallet` import the
// module that submits transactions, which already imports the wallet.
//
// It lives under `features/assets`, which is downstream of both halves and is
// where an asset balance belongs; placing it beside the submitters would move
// the cycle to `assets <-> ops`.

import { useEffect, useMemo } from "react";
import { useActiveChain } from "@/features/chain";
import { type PendingTotals, pruneByBalances, usePending, usePendingByAsset } from "@/features/tx";
import {
  type AssetBalance,
  useInvalidateWalletState,
  useWalletInstance,
  useWalletState,
  type WalletState,
} from "@/features/wallet";
import { formatAssetCompact } from "@/shared/lib/format/asset";
import type { AssetBalanceLabel } from "./asset-option";
import { settlingPoll } from "./settling-poll";

/// A confirmed balance plus the in-flight value attached to it.
export interface AssetBalanceView extends AssetBalance {
  /// Value expected once an in-flight tx's outputs are scanned. Added to the
  /// confirmed total so the displayed balance does not dip while change notes
  /// propagate.
  pending: bigint;
  /// Value leaving via in-flight tx(s). Drives the directional "settling"
  /// hint: `outflow > 0` renders `-outflow`, otherwise `+pending`.
  outflow: bigint;
}

export interface BalancesState extends Omit<WalletState, "balances"> {
  balances: AssetBalanceView[];
}

/// What a balance consumer needs, and nothing else.
///
/// Not `UseQueryResult<BalancesState>`. Returning the whole result requires
/// spreading `useWalletState()`'s, and a spread reads every property on
/// react-query's tracking proxy, subscribing the observer to all of them. Every
/// consumer then re-renders twice per background poll on the `isFetching` flip
/// alone, with the balances unchanged — and since `useBalances` is reached from
/// `useAssetBalance` and `useAssetBalanceLabel` as well as the portfolio card,
/// that is every mounted form on the 30s cadence.
///
/// Naming the three fields callers actually read keeps the subscription to
/// those three, none of which move on a no-op refetch. Anything wanting the
/// query's fetch state — the hero's retry wants `isFetching` — reads
/// `useWalletState()` directly, where tracking it is the point.
export interface BalancesResult {
  /// `undefined` until the first sync succeeds; see `useAssetBalance`.
  data: BalancesState | undefined;
  /// The last sync failure, surfaced by `SyncNotice`.
  error: Error | null;
  /// First load only, not a background refetch.
  isLoading: boolean;
}

/// Confirmed balances with the in-flight overlay applied.
///
/// Also owns the two side effects the overlay implies: clearing watermark-bound
/// entries once a sync has credited them, and resyncing faster while any
/// remain.
export function useBalances(): BalancesResult {
  const query = useWalletState();
  const wallet = useWalletInstance();
  const { chainId } = useActiveChain();
  const invalidate = useInvalidateWalletState();
  const pending = usePendingByAsset(chainId);
  const allPending = usePending();

  // Only this chain's entries; this query cannot observe another chain's
  // in-flight swap settling.
  const hasWatermarkPending = useMemo(() => {
    for (const e of allPending.values()) {
      if (e.chainId === chainId && e.clearWhenBalanceAtLeast !== undefined) return true;
    }
    return false;
  }, [allPending, chainId]);

  // Keyed on `syncedAt` so this runs once per completed sync, the only point at
  // which a watermark can newly be satisfied.
  const syncedAt = query.data?.syncedAt;
  useEffect(() => {
    if (!wallet || syncedAt === undefined) return;
    pruneByBalances(chainId, (asset) => wallet.balance(asset));
  }, [wallet, chainId, syncedAt]);

  // Joins the shared poll rather than starting one. `hasWatermarkPending` going
  // false is the hard stop.
  useEffect(() => {
    if (!hasWatermarkPending) return;
    return settlingPoll.join(invalidate);
  }, [hasWatermarkPending, invalidate]);

  // Read as three named fields rather than spread; see `BalancesResult`.
  const { data, error, isLoading } = query;
  const merged = useMemo(() => (data ? mergePending(data, pending) : undefined), [data, pending]);
  return useMemo(() => ({ data: merged, error, isLoading }), [merged, error, isLoading]);
}

/// The display row for one asset.
///
/// `undefined` means the balance is unknown: no sync has succeeded yet, or the
/// last one failed. `SyncNotice` reports that on screen.
///
/// Once a sync has succeeded, an asset with no row is a zero balance and is
/// reported as one. `computeBalances` emits only assets holding unspent notes,
/// so returning `undefined` for a token the user holds none of would make
/// `validateAmount` skip the balance check, leaving the submit button live and
/// the hint and `max` controls absent until the SDK raised
/// `InsufficientCoverError` after generating a proof.
export function useAssetBalance(assetId: bigint | undefined): AssetBalanceView | undefined {
  const data = useBalances().data;
  if (assetId === undefined || !data) return undefined;
  return (
    data.balances.find((b) => b.asset === assetId) ?? {
      asset: assetId,
      balance: 0n,
      notes: 0,
      pending: 0n,
      outflow: 0n,
    }
  );
}

/// An asset with only in-flight value still needs a row; otherwise a first
/// deposit shows nothing until the scanner catches up.
function mergePending(state: WalletState, pending: Map<bigint, PendingTotals>): BalancesState {
  const seen = new Set<bigint>();
  const merged: AssetBalanceView[] = state.balances.map((b) => {
    seen.add(b.asset);
    const p = pending.get(b.asset);
    return { ...b, pending: p?.pendingIn ?? 0n, outflow: p?.outflow ?? 0n };
  });
  for (const [asset, p] of pending) {
    if (seen.has(asset)) continue;
    if (p.pendingIn === 0n && p.outflow === 0n) continue;
    merged.push({ asset, balance: 0n, notes: 0, pending: p.pendingIn, outflow: p.outflow });
  }
  merged.sort((a, b) => Number(a.asset - b.asset));
  return { ...state, balances: merged };
}

/// Formatted shielded balance per asset, for labelling a picker's options.
///
/// Confirmed balance only, without the in-flight overlay `useBalances` adds:
/// this labels a menu of what can be spent now, which excludes settling value.
/// The portfolio card carries the pending figure, marked "settling".
///
/// `undefined` until a sync has succeeded, so the options read as bare symbols
/// rather than claiming a zero balance for every asset while loading.
///
/// Compact rather than exact: an 18-decimal balance rendered in full is wider
/// than the select it sits in.
///
/// Converted with `toBaseUnits`, so a yield asset's row states what its notes
/// are worth now rather than when they were credited. The two differ by exactly
/// the yield earned, so an option stating a rate beside a figure that never
/// moves reads as broken.
export function useAssetBalanceLabel(): AssetBalanceLabel {
  const { data } = useBalances();
  // Indexed once rather than scanned per option, as in `AssetsCard`: a picker
  // calls this for every registered asset on every render of the surrounding
  // form.
  return useMemo((): AssetBalanceLabel => {
    if (!data) return () => undefined;
    const byAsset = new Map(data.balances.map((b) => [b.asset, b.balance]));
    return (asset) => formatAssetCompact(byAsset.get(asset.id) ?? 0n, asset);
  }, [data]);
}
