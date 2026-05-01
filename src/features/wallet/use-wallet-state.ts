import type { WalletApi } from "@lelantos-org/sdk/wallet";
import { type UseQueryResult, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
  pruneByBalances,
  usePending,
  usePendingByAsset,
} from "@/features/actions/pending-tx-store";
import { useWallet } from "@/features/wallet";

export interface AssetBalance {
  asset: bigint;
  /// Confirmed balance from notes the wallet has decrypted locally.
  balance: bigint;
  notes: number;
  /// Value the wallet expects to receive once an in-flight tx's outputs
  /// are picked up by the FMD scanner. Non-zero only while a mutation is
  /// settling. Used to compute `balance + pending` so the displayed total
  /// stays stable while change-notes propagate.
  pending: bigint;
  /// Amount leaving the wallet via in-flight tx(s) — withdraw publicOut
  /// or transfer recipient amount. Drives the directional sign in the
  /// "settling" hint: `outflow > 0` → "-outflow", else "+pending".
  outflow: bigint;
}

export interface WalletState {
  balances: AssetBalance[];
  syncedAt: number;
}

const SYNC_LIMIT = 500;
const POLL_MS = 30_000;
/// Faster cadence when watermark-bound pending entries exist (e.g. swap
/// B-notes flushed async by the relayer). Avoids 30s "settling" stalls.
const POLL_MS_PENDING = 5_000;

export const walletStateKey = (address?: string) => ["wallet-state", address ?? null] as const;

function computeBalances(wallet: WalletApi): AssetBalance[] {
  const byAsset = new Map<bigint, { balance: bigint; notes: number }>();
  for (const n of wallet.allNotes({ spent: false })) {
    const cur = byAsset.get(n.asset) ?? { balance: 0n, notes: 0 };
    cur.balance += n.value;
    cur.notes += 1;
    byAsset.set(n.asset, cur);
  }
  return [...byAsset.entries()]
    .map(([asset, { balance, notes }]) => ({
      asset,
      balance,
      notes,
      pending: 0n,
      outflow: 0n,
    }))
    .sort((a, b) => (a.asset < b.asset ? -1 : a.asset > b.asset ? 1 : 0));
}

/// Single source of truth for wallet sync + derived balances; polls while the
/// tab is visible. Mutations should call `useInvalidateWalletState()` after a
/// successful submit. In-flight `pending-tx-store` inflows are spliced onto
/// confirmed balances so the displayed total doesn't dip before the FMD
/// scanner picks up the produced change/self notes.
export function useWalletState(): UseQueryResult<WalletState> {
  const { wallet } = useWallet();
  const pending = usePendingByAsset();
  const allPending = usePending();
  const hasWatermarkPending = useMemo(() => {
    for (const e of allPending.values()) {
      if (e.clearWhenBalanceAtLeast !== undefined) return true;
    }
    return false;
  }, [allPending]);
  const query = useQuery<WalletState>({
    queryKey: walletStateKey(wallet?.address),
    enabled: !!wallet,
    queryFn: async () => {
      if (!wallet) throw new Error("wallet not ready");
      await wallet.syncNotes({ limit: SYNC_LIMIT });
      // Self-clear watermark-bound pending entries (e.g. swap B-notes)
      // now that the latest sync may have credited the assetOut.
      pruneByBalances((asset) => wallet.balance(asset));
      return { balances: computeBalances(wallet), syncedAt: Date.now() };
    },
    refetchInterval: hasWatermarkPending ? POLL_MS_PENDING : POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
  const data = query.data;
  const merged = useMemo(() => (data ? mergePending(data, pending) : data), [data, pending]);
  return useMemo(
    () => ({ ...query, data: merged }) as UseQueryResult<WalletState>,
    [query, merged],
  );
}

function mergePending(
  state: WalletState,
  pending: Map<bigint, import("@/features/actions/pending-tx-store").PendingTotals>,
): WalletState {
  if (pending.size === 0) return state;
  const seen = new Set<bigint>();
  const merged = state.balances.map((b) => {
    seen.add(b.asset);
    const p = pending.get(b.asset);
    if (!p) return b;
    return { ...b, pending: p.pendingIn, outflow: p.outflow };
  });
  for (const [asset, p] of pending) {
    if (seen.has(asset)) continue;
    if (p.pendingIn === 0n && p.outflow === 0n) continue;
    merged.push({ asset, balance: 0n, notes: 0, pending: p.pendingIn, outflow: p.outflow });
  }
  merged.sort((a, b) => (a.asset < b.asset ? -1 : a.asset > b.asset ? 1 : 0));
  return { ...state, balances: merged };
}

/// Returns a callback that invalidates the wallet-state query, triggering a
/// sync + balance recompute; call after successful mutations.
export function useInvalidateWalletState(): () => Promise<void> {
  const { wallet } = useWallet();
  const qc = useQueryClient();
  const address = wallet?.address;
  return useCallback(
    () => qc.invalidateQueries({ queryKey: walletStateKey(address) }),
    [qc, address],
  );
}

/// Wipe the local note store and resync from scratch.
export function useHardRefresh(): { run(): Promise<void>; busy: boolean } {
  const { wallet } = useWallet();
  const invalidate = useInvalidateWalletState();
  const run = useCallback(async () => {
    if (!wallet) return;
    await wallet.noteStore.save({ version: 2, notes: [] });
    await wallet.refresh();
    await invalidate();
  }, [wallet, invalidate]);
  return { run, busy: false };
}

/// Drop spent notes from the local note store. Balance unchanged; shrinks
/// the persisted file and lowers scan cost.
export function useCompactNotes(): { run(): Promise<number>; busy: boolean } {
  const { wallet } = useWallet();
  const invalidate = useInvalidateWalletState();
  const run = useCallback(async () => {
    if (!wallet) return 0;
    const { removed } = await wallet.compact();
    if (removed > 0) await invalidate();
    return removed;
  }, [wallet, invalidate]);
  return { run, busy: false };
}
