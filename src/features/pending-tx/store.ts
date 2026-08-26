// In-flight tx inflows the local wallet has not yet observed via an FMD scan.
// Keeps the displayed balance stable between the moment input notes are marked
// spent and the moment the change and self notes are decrypted.
//
// Entries are keyed by `(chainId, txHash, asset)`, so one tx can credit several
// assets — a swap credits leg-1 change and a leg-2 B-note.
//
// The chainId is part of the key rather than the store being cleared on a
// switch: asset ids are unique only within a chain, so an entry for asset 1 on
// one chain would otherwise inflate asset 1's balance on another. Keying also
// lets an in-flight tx survive the user visiting another chain and returning.

import { useMemo, useSyncExternalStore } from "react";
import { chainKey } from "@/config/chains";

export interface PendingShape {
  /// Asset id this entry credits.
  asset: bigint;
  /// Amount the wallet expects to recover once the FMD scanner indexes the
  /// produced own-outputs.
  pendingIn: bigint;
  /// Amount leaving the wallet. Determines the sign of the settling hint.
  outflow: bigint;
  /// Watermark for outputs the lifecycle tracker cannot observe, such as a swap
  /// B-note flushed asynchronously by the relayer. The entry self-clears once
  /// the confirmed balance crosses this threshold.
  clearWhenBalanceAtLeast?: bigint;
}

export interface PendingEntry extends PendingShape {
  /// Composite key `${chainId}:${txHash}:${asset}`.
  id: string;
  /// Chain the tx was submitted on.
  chainId: bigint;
  /// Originating tx hash. Several entries may share one, for a multi-asset tx.
  txHash: string;
  /// Wall-clock deadline, set only on watermark-bound entries. See
  /// `WATERMARK_TTL_MS`.
  expiresAt?: number;
}

/// Lifetime of a watermark-bound entry.
///
/// A watermark clears only by observing the balance cross it, so an output the
/// relayer never flushes would keep its entry — and the faster resync cadence it
/// drives — alive for the rest of the session. Past this deadline the entry is
/// dropped and the display falls back to what the wallet has decrypted.
const WATERMARK_TTL_MS = 10 * 60_000;

function expiryOf(shape: PendingShape): number | undefined {
  return shape.clearWhenBalanceAtLeast === undefined ? undefined : Date.now() + WATERMARK_TTL_MS;
}

const entries = new Map<string, PendingEntry>();
const listeners = new Set<() => void>();
let snapshot: ReadonlyMap<string, PendingEntry> = new Map();

function bump() {
  snapshot = new Map(entries);
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

function getSnapshot(): ReadonlyMap<string, PendingEntry> {
  return snapshot;
}

export function pendingKey(chainId: bigint, txHash: string, asset: bigint): string {
  return `${chainKey(chainId)}:${txHash}:${asset}`;
}

/// Bulk add, with a single `bump()` so subscribers see every entry in one tick.
export function addPendingMany(chainId: bigint, txHash: string, shapes: PendingShape[]): void {
  if (shapes.length === 0) return;
  for (const s of shapes) {
    const id = pendingKey(chainId, txHash, s.asset);
    entries.set(id, { id, chainId, txHash, ...s, expiresAt: expiryOf(s) });
  }
  bump();
}

/// Lifecycle-driven clear: remove every entry for `txHash` that is not bound to
/// a balance watermark. Watermark entries self-clear via `pruneByBalances`,
/// since the `ownCommitments` lifecycle cannot observe their commitment — as
/// with a swap B-note flushed asynchronously by the relayer.
export function clearPending(chainId: bigint, txHash: string): void {
  let removed = false;
  for (const [k, e] of entries) {
    if (e.chainId !== chainId || e.txHash !== txHash) continue;
    if (e.clearWhenBalanceAtLeast !== undefined) continue;
    entries.delete(k);
    removed = true;
  }
  if (removed) bump();
}

/// Walk watermark-bound entries and clear those whose asset's confirmed balance
/// has reached the threshold. Called after each sync so swap B-notes self-clear
/// once the scanner credits them.
///
/// `balanceOf` reads the active chain's wallet, so only that chain's entries are
/// eligible; another chain's watermark cannot be judged against it.
export function pruneByBalances(chainId: bigint, balanceOf: (asset: bigint) => bigint): void {
  let removed = false;
  for (const [k, e] of entries) {
    if (e.chainId !== chainId) continue;
    if (e.clearWhenBalanceAtLeast === undefined) continue;
    if (balanceOf(e.asset) >= e.clearWhenBalanceAtLeast) {
      entries.delete(k);
      removed = true;
    }
  }
  if (removed) bump();
}

/// Drop watermark-bound entries past their `expiresAt`.
///
/// Counterpart to `pruneByBalances`, which clears entries the wallet has
/// confirmed. Called from the settling poll, so the poll an entry keeps alive
/// also retires it.
export function pruneExpired(now: number = Date.now()): void {
  let removed = false;
  for (const [k, e] of entries) {
    if (e.expiresAt === undefined || e.expiresAt > now) continue;
    entries.delete(k);
    removed = true;
  }
  if (removed) bump();
}

/// React hook returning the live map of pending entries.
export function usePending(): ReadonlyMap<string, PendingEntry> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export interface PendingTotals {
  /// Sum of `pendingIn` across all in-flight entries for this asset. Keeps the
  /// displayed balance stable while outputs propagate.
  pendingIn: bigint;
  /// Sum of `outflow` across all in-flight entries. When positive the hint reads
  /// `-outflow settling`; otherwise `+pendingIn settling`.
  outflow: bigint;
}

/// Aggregate pending entries per asset, keeping balances stable across an
/// in-flight tx and driving the directional settling hint. Memoised on the raw
/// snapshot so downstream `useMemo`s do not re-run on every render.
export function usePendingByAsset(chainId: bigint): Map<bigint, PendingTotals> {
  const map = usePending();
  return useMemo(() => {
    const out = new Map<bigint, PendingTotals>();
    for (const e of map.values()) {
      if (e.chainId !== chainId) continue;
      const cur = out.get(e.asset) ?? { pendingIn: 0n, outflow: 0n };
      cur.pendingIn += e.pendingIn;
      cur.outflow += e.outflow;
      out.set(e.asset, cur);
    }
    return out;
  }, [map, chainId]);
}
