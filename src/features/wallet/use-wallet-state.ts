import type { WalletApi } from "@lelantos-org/sdk/wallet";
import { type UseQueryResult, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useActiveChain } from "@/features/chain/ChainProvider";
import { useWallet } from "@/features/wallet";
import { syncProgress } from "@/features/wallet/sync-progress-store";
import { BALANCE_POLL_MS, BALANCE_STALE_MS, pollInterval, useIsIdle } from "@/shared/lib/activity";

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

/// Chain-scoped as well as address-scoped. The address is the same on every
/// chain, so without the chainId a switch would serve the previous chain's
/// balances from cache until the query happened to refetch.
export const walletStateKey = (chainId?: bigint, address?: string) =>
  ["wallet-state", chainId?.toString() ?? null, address ?? null] as const;

function computeBalances(wallet: WalletApi): AssetBalance[] {
  const byAsset = new Map<bigint, { balance: bigint; notes: number }>();
  for (const n of wallet.notes({ spent: false })) {
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
      // Names this sync, so a superseded run finishing late releases the
      // counter only if it still owns it.
      const token = `${chainId}:${wallet.address}`;
      try {
        await wallet.syncNotes({
          limit: SYNC_LIMIT,
          onProgress: (p) => syncProgress.scanning(token, p.fetched, p.hits),
        });
      } finally {
        // Also on failure: a stalled counter left on screen would read as a
        // sync still running.
        syncProgress.finished(token);
      }
      return { balances: computeBalances(wallet), syncedAt: Date.now() };
    },
    // The most expensive poll in the app — a full `syncNotes` plus a balance
    // recompute over every unspent note, on the main thread. Slowed on an
    // unattended tab, which `refetchIntervalInBackground: false` does not
    // cover because that tab is still visible.
    refetchInterval: () => pollInterval(BALANCE_POLL_MS, idle),
    refetchIntervalInBackground: false,
    // Several components reach this query. At `staleTime: 0` every mount —
    // so every route change into a form — refetches, firing a redundant
    // `syncNotes`. Mutations still show immediately: they invalidate the query
    // explicitly via `useInvalidateWalletState`, which ignores staleTime.
    staleTime: BALANCE_STALE_MS,
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
  const { chainId } = useActiveChain();
  const qc = useQueryClient();
  const invalidate = useInvalidateWalletState();
  const [busy, setBusy] = useState(false);
  const address = wallet?.address;
  const run = useCallback(async () => {
    if (!wallet) return;
    setBusy(true);
    try {
      // The wipe has to be serialised against any sync already running.
      // `syncNotes` loads the notes file once at entry, mutates it for the
      // whole run and re-saves it in a `finally` — so an in-flight poll would
      // write the pre-wipe notes *and* its stale cursor straight back over
      // this, and "wipe + resync" would report success having changed nothing.
      // The `disabled={syncing}` guard in the UI cannot cover it: that reflects
      // `isFetching` at render time, not a refetch starting one tick later.
      await qc.cancelQueries({ queryKey: walletStateKey(chainId, address) });
      await wallet.noteStore.save({ version: 2, notes: [] });
      await wallet.refresh();
      await invalidate();
    } finally {
      setBusy(false);
    }
  }, [wallet, invalidate, qc, chainId, address]);
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
