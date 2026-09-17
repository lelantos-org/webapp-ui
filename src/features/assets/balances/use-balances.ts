import { useEffect, useMemo } from "react";
import { useActiveChain } from "@/features/chain";
import { type PendingTotals, pruneByBalances, usePending, usePendingByAsset } from "@/features/tx";
import {
  type AssetBalance,
  useInvalidateWalletState,
  useWalletState,
  type WalletState,
} from "@/features/wallet";
import { settlingPoll } from "./settling-poll";

/// A confirmed balance plus the in-flight value attached to it.
export interface AssetBalanceView extends AssetBalance {
  /// In-flight value expected in, added so the balance does not dip while change notes propagate.
  pending: bigint;
  /// In-flight value leaving; decides the sign of the "settling" hint.
  outflow: bigint;
}

export interface BalancesState extends Omit<WalletState, "balances" | "notes"> {
  balances: AssetBalanceView[];
}

/// What a balance consumer reads. Named fields, not the query result: spreading that
/// subscribes to `isFetching` and re-renders every mounted form on each poll.
export interface BalancesResult {
  /// `undefined` until the first sync succeeds.
  data: BalancesState | undefined;
  /// The last sync failure, surfaced by `SyncNotice`.
  error: Error | null;
  /// First load only, not a background refetch.
  isLoading: boolean;
}

/// Confirmed balances with the in-flight overlay; prunes settled entries, polls while any remain.
export function useBalances(): BalancesResult {
  const query = useWalletState();
  const { chainId } = useActiveChain();
  const invalidate = useInvalidateWalletState();
  const pending = usePendingByAsset(chainId);
  const allPending = usePending();

  const hasWatermarkPending = useMemo(() => {
    for (const e of allPending.values()) {
      if (e.chainId === chainId && e.clearWhenBalanceAtLeast !== undefined) return true;
    }
    return false;
  }, [allPending, chainId]);

  const syncedAt = query.data?.syncedAt;
  const confirmed = query.data?.balances;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `confirmed` is read as of the sync `syncedAt` names; its identity alone would skip a sync that moved nothing
  useEffect(() => {
    if (confirmed === undefined) return;
    pruneByBalances(chainId, (asset) => confirmed.find((b) => b.asset === asset)?.balance ?? 0n);
  }, [chainId, syncedAt]);

  useEffect(() => {
    if (!hasWatermarkPending) return;
    return settlingPoll.join(invalidate);
  }, [hasWatermarkPending, invalidate]);

  const { data, error, isLoading } = query;
  const merged = useMemo(() => (data ? mergePending(data, pending) : undefined), [data, pending]);
  return useMemo(() => ({ data: merged, error, isLoading }), [merged, error, isLoading]);
}

/// The display row for one asset: `undefined` only until a sync succeeds, then zero for an unheld
/// asset, since `undefined` would skip the amount validation's balance check.
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

function mergePending(
  { notes: _notes, ...state }: WalletState,
  pending: Map<bigint, PendingTotals>,
): BalancesState {
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
