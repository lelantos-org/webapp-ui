// The display balance: what the wallet holds, plus what is on its way.
//
// Composition, deliberately kept out of both halves. `useWalletState` answers
// only "what has this wallet decrypted"; `features/pending-tx` holds only what
// is in flight. Folding the overlay into the wallet made `features/wallet`
// import the module that submits transactions — which already imports the
// wallet — and left the wallet unable to state what it actually holds without
// subtracting a concern it did not own.
//
// It lives with assets because an asset balance is what it produces, and
// because `features/assets` is downstream of both halves: putting it beside
// the submitters instead only moved the cycle to `assets <-> actions`.

import type { UseQueryResult } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useActiveChain } from "@/features/chain/ChainProvider";
import {
  type PendingTotals,
  pruneByBalances,
  pruneExpired,
  usePending,
  usePendingByAsset,
} from "@/features/pending-tx/store";
import { useWallet } from "@/features/wallet";
import {
  type AssetBalance,
  useInvalidateWalletState,
  useWalletState,
  type WalletState,
} from "@/features/wallet/use-wallet-state";

/// How soon to nudge a resync after a watermark-bound entry appears.
///
/// Swap B-notes are flushed asynchronously by the relayer, so the only way to
/// see them land is to look again. Without this the balance sits on the
/// wallet's 30s cadence and the "settling" hint appears to stall.
const SETTLING_POLL_MS = 5_000;

/// Ceiling for the backoff below, matching the wallet query's own cadence so
/// the settling poll adds no further requests at that point.
const SETTLING_POLL_MAX_MS = 30_000;

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
/// Also owns the two side effects that overlay implies: clearing
/// watermark-bound entries once a sync has credited them, and resyncing
/// faster while any remain.
export function useBalances(): UseQueryResult<BalancesState> {
  const query = useWalletState();
  const { wallet } = useWallet();
  const { chainId } = useActiveChain();
  const invalidate = useInvalidateWalletState();
  const pending = usePendingByAsset(chainId);
  const allPending = usePending();

  // Only this chain's entries: another chain's in-flight swap is not something
  // this query can observe settling.
  const hasWatermarkPending = useMemo(() => {
    for (const e of allPending.values()) {
      if (e.chainId === chainId && e.clearWhenBalanceAtLeast !== undefined) return true;
    }
    return false;
  }, [allPending, chainId]);

  // Keyed on `syncedAt` so this runs once per completed sync — the only moment
  // a watermark can newly be satisfied.
  const syncedAt = query.data?.syncedAt;
  useEffect(() => {
    if (!wallet || syncedAt === undefined) return;
    pruneByBalances(chainId, (asset) => wallet.balance(asset));
  }, [wallet, chainId, syncedAt]);

  // Backs off rather than holding at 5s: the note is either flushed within a
  // few seconds or not at all, and an unflushed one would otherwise run a full
  // `syncNotes` every 5s for the rest of the session. `pruneExpired` is the
  // hard stop — once it drops the last watermark entry `hasWatermarkPending`
  // goes false and this effect clears the timer.
  useEffect(() => {
    if (!hasWatermarkPending) return;
    let delay = SETTLING_POLL_MS;
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      pruneExpired();
      void invalidate();
      delay = Math.min(delay * 2, SETTLING_POLL_MAX_MS);
      id = setTimeout(tick, delay);
    };
    id = setTimeout(tick, delay);
    return () => clearTimeout(id);
  }, [hasWatermarkPending, invalidate]);

  const data = query.data;
  const merged = useMemo(() => (data ? mergePending(data, pending) : undefined), [data, pending]);
  return useMemo(
    () => ({ ...query, data: merged }) as UseQueryResult<BalancesState>,
    [query, merged],
  );
}

/// The display row for one asset, or `undefined` when there is nothing to show
/// — which is also what a failed or still-running sync looks like, so callers
/// must read "no row" as "unknown", not "zero". `SyncErrorNotice` is what
/// tells the two apart on screen.
export function useAssetBalance(assetId: bigint | undefined): AssetBalanceView | undefined {
  const balances = useBalances().data?.balances;
  if (assetId === undefined) return undefined;
  return balances?.find((b) => b.asset === assetId);
}

/// An asset with only in-flight value still needs a row, or a first deposit
/// shows nothing at all until the scanner catches up.
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
