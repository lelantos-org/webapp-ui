// The display balance: what the wallet holds, plus what is on its way.
//
// The composition is kept out of both halves. `useWalletState` answers only what
// this wallet has decrypted; `features/pending-tx` holds only what is in flight.
// Folding the overlay into the wallet would make `features/wallet` import the
// module that submits transactions, which already imports the wallet.
//
// It lives under `features/assets`, which is downstream of both halves and is
// where an asset balance belongs; placing it beside the submitters would move
// the cycle to `assets <-> actions`.

import type { UseQueryResult } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useActiveChain } from "@/features/chain";
import {
  type PendingTotals,
  pruneByBalances,
  pruneExpired,
  usePending,
  usePendingByAsset,
} from "@/features/pending-tx";
import {
  type AssetBalance,
  useInvalidateWalletState,
  useWallet,
  useWalletState,
  type WalletState,
} from "@/features/wallet";
import { jitter } from "@/shared/lib/activity";
import { formatDecimalCompact } from "@/shared/lib/format";
import type { AssetBalanceLabel } from "./asset-option";

/// How soon to nudge a resync after a watermark-bound entry appears.
///
/// Swap B-notes are flushed asynchronously by the relayer, so observing them
/// requires looking again. Without this the balance follows the wallet's 30s
/// cadence and the "settling" hint appears to stall.
const SETTLING_POLL_MS = 5_000;

/// Ceiling for the backoff below, matching the wallet query's own cadence so
/// the settling poll adds no further requests at that point.
const SETTLING_POLL_MAX_MS = 30_000;

/// One settling poll per page, shared by every `useBalances` caller.
///
/// `useBalances` is called by every balance consumer — `AssetsCard` and
/// whichever form is mounted, at least — and each tick runs a full `syncNotes`
/// on the main thread. A per-caller timer would run the most expensive operation
/// in the app on several overlapping schedules with independent backoffs.
///
/// A closure rather than module-level mutables: the timer, its backoff and its
/// subscriber count form one piece of state with one invariant, that the timer
/// runs exactly while `refs > 0`.
function createSettlingPoll() {
  let refs = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let delay = SETTLING_POLL_MS;
  /// The most recently registered invalidator. All are equivalent, closing over
  /// the same query key.
  let invalidate: (() => Promise<void>) | undefined;

  // `delay` is the backoff floor; the timer fires on a jittered draw around it
  // so the settling burst is not exactly periodic. The backoff itself stays
  // exact, since jittering the accumulator would compound.
  const schedule = () => {
    timer = setTimeout(() => {
      pruneExpired();
      void invalidate?.();
      delay = Math.min(delay * 2, SETTLING_POLL_MAX_MS);
      schedule();
    }, jitter(delay));
  };

  return {
    /// Join the poll; returns the leave function.
    ///
    /// Backs off rather than holding at 5s: a note is either flushed within a
    /// few seconds or not at all, and an unflushed one would otherwise run a
    /// full `syncNotes` every 5s for the rest of the session. `pruneExpired`
    /// provides the hard stop — once it drops the last watermark entry the
    /// callers unsubscribe and the timer is cleared.
    join(next: () => Promise<void>): () => void {
      invalidate = next;
      refs += 1;
      if (timer === undefined) {
        delay = SETTLING_POLL_MS;
        schedule();
      }
      return () => {
        refs -= 1;
        if (refs > 0) return;
        clearTimeout(timer);
        timer = undefined;
        invalidate = undefined;
      };
    },
  };
}

const settlingPoll = createSettlingPoll();

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

/// Confirmed balances with the in-flight overlay applied.
///
/// Also owns the two side effects the overlay implies: clearing watermark-bound
/// entries once a sync has credited them, and resyncing faster while any
/// remain.
export function useBalances(): UseQueryResult<BalancesState> {
  const query = useWalletState();
  const { wallet } = useWallet();
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

  const data = query.data;
  const merged = useMemo(() => (data ? mergePending(data, pending) : undefined), [data, pending]);
  return useMemo(
    () => ({ ...query, data: merged }) as UseQueryResult<BalancesState>,
    [query, merged],
  );
}

/// The display row for one asset.
///
/// `undefined` means the balance is unknown: no sync has succeeded yet, or the
/// last one failed. `SyncErrorNotice` reports that on screen.
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
  merged.sort((a, b) => (a.asset < b.asset ? -1 : a.asset > b.asset ? 1 : 0));
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
export function useAssetBalanceLabel(): AssetBalanceLabel {
  const { data } = useBalances();
  // Indexed once rather than scanned per option, as in `AssetsCard`: a picker
  // calls this for every registered asset on every render of the surrounding
  // form.
  return useMemo((): AssetBalanceLabel => {
    if (!data) return () => undefined;
    const byAsset = new Map(data.balances.map((b) => [b.asset, b.balance]));
    return (asset) =>
      formatDecimalCompact((byAsset.get(asset.id) ?? 0n) * asset.scale, asset.decimals);
  }, [data]);
}
