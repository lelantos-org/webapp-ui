import type { WalletApi } from "@lelantos-org/sdk/wallet";
import { type UseQueryResult, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useActiveChain } from "@/features/chain/ChainProvider";
import { useWallet } from "@/features/wallet";
import { syncProgress } from "@/features/wallet/sync-progress-store";
import { IDLE_POLL_FACTOR, useIsIdle } from "@/shared/lib/activity";

/// Confirmed holdings for one asset: what the wallet has actually decrypted.
///
/// Deliberately carries no notion of in-flight value. Splicing that in here
/// made `features/wallet` depend on `features/actions`, which already depends
/// on the wallet — and it conflated "what I hold" with "what I am told is
/// coming". `useBalances` in `features/actions` composes the two.
export interface AssetBalance {
  asset: bigint;
  balance: bigint;
  notes: number;
}

export interface WalletState {
  balances: AssetBalance[];
  syncedAt: number;
}

const SYNC_LIMIT = 500;
const POLL_MS = 30_000;
/// Window in which a remount reuses the cached state instead of resyncing.
/// Well under `POLL_MS`, so the polling cadence is unaffected.
const STALE_MS = 10_000;

/// Chain-scoped as well as address-scoped. The address is the same on every
/// chain, so without the chainId a switch would serve the previous chain's
/// balances from cache until the query happened to refetch.
export const walletStateKey = (chainId?: bigint, address?: string) =>
  ["wallet-state", chainId?.toString() ?? null, address ?? null] as const;

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
    }))
    .sort((a, b) => (a.asset < b.asset ? -1 : a.asset > b.asset ? 1 : 0));
}

/// Sync the wallet and derive confirmed balances; polls while the tab is
/// visible. Mutations should call `useInvalidateWalletState()` after a
/// successful submit.
///
/// Returns only what the wallet has decrypted. Callers that want the
/// display balance — confirmed plus in-flight — use `useBalances`.
export function useWalletState(): UseQueryResult<WalletState> {
  const { wallet } = useWallet();
  const { chainId } = useActiveChain();
  const idle = useIsIdle();
  return useQuery<WalletState>({
    queryKey: walletStateKey(chainId, wallet?.address),
    enabled: !!wallet,
    queryFn: async () => {
      if (!wallet) throw new Error("wallet not ready");
      // `SYNC_LIMIT` is the page size, not a cap: `syncNotes` pages the feed
      // to exhaustion from its persisted cursor.
      try {
        await wallet.syncNotes({
          limit: SYNC_LIMIT,
          onProgress: (p) => syncProgress.scanning(p.fetched, p.hits),
        });
      } finally {
        // Also on failure: a stalled counter left on screen would read as a
        // sync still running.
        syncProgress.finished();
      }
      return { balances: computeBalances(wallet), syncedAt: Date.now() };
    },
    // The most expensive poll in the app — a full `syncNotes` plus a balance
    // recompute over every unspent note, on the main thread. Slowed on an
    // unattended tab, which `refetchIntervalInBackground: false` does not
    // cover because that tab is still visible.
    refetchInterval: idle ? POLL_MS * IDLE_POLL_FACTOR : POLL_MS,
    refetchIntervalInBackground: false,
    // Several components reach this query. At `staleTime: 0` every mount —
    // so every route change into a form — refetches, firing a redundant
    // `syncNotes`. Mutations still show immediately: they invalidate the query
    // explicitly via `useInvalidateWalletState`, which ignores staleTime.
    staleTime: STALE_MS,
  });
}

/// Returns a callback that invalidates the wallet-state query, triggering a
/// sync + balance recompute; call after successful mutations.
export function useInvalidateWalletState(): () => Promise<void> {
  const { wallet } = useWallet();
  const { chainId } = useActiveChain();
  const qc = useQueryClient();
  const address = wallet?.address;
  return useCallback(
    () => qc.invalidateQueries({ queryKey: walletStateKey(chainId, address) }),
    [qc, chainId, address],
  );
}

/// Wipe the local note store and resync from scratch.
///
/// Saving a file with no `cursor` is what makes this a *hard* refresh: the
/// next sync restarts from the beginning of the feed rather than resuming.
export function useHardRefresh(): { run(): Promise<void>; busy: boolean } {
  const { wallet } = useWallet();
  const invalidate = useInvalidateWalletState();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async () => {
    if (!wallet) return;
    setBusy(true);
    try {
      await wallet.noteStore.save({ version: 2, notes: [] });
      await wallet.refresh();
      await invalidate();
    } finally {
      setBusy(false);
    }
  }, [wallet, invalidate]);
  return { run, busy };
}

/// Drop spent notes from the local note store. Balance unchanged; shrinks
/// the persisted file and lowers scan cost.
export function useCompactNotes(): { run(): Promise<number>; busy: boolean } {
  const { wallet } = useWallet();
  const invalidate = useInvalidateWalletState();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async () => {
    if (!wallet) return 0;
    setBusy(true);
    try {
      const { removed } = await wallet.compact();
      if (removed > 0) await invalidate();
      return removed;
    } finally {
      setBusy(false);
    }
  }, [wallet, invalidate]);
  return { run, busy };
}
