// In-flight tx inflows that the local wallet hasn't yet observed via FMD
// scan. Keeps the displayed balance from "disappearing" between the
// moment input notes are marked spent and the moment the change/self
// notes are decrypted.
//
// Entries are keyed by `(txHash, asset)` so a single tx can credit
// multiple assets (e.g. swap: leg-1 change + leg-2 B-note).

import { useMemo, useSyncExternalStore } from "react";
import type { PendingShape } from "@/features/actions/pending-policy";

export interface PendingEntry extends PendingShape {
  /// Composite key `${txHash}:${asset}`.
  id: string;
  /// Originating tx hash. Multiple entries may share this (multi-asset tx).
  txHash: string;
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

export function pendingKey(txHash: string, asset: bigint): string {
  return `${txHash}:${asset}`;
}

export function addPending(txHash: string, shape: PendingShape): void {
  const id = pendingKey(txHash, shape.asset);
  entries.set(id, { id, txHash, ...shape });
  bump();
}

/// Bulk add. Single bump() so subscribers see all entries in one tick.
export function addPendingMany(txHash: string, shapes: PendingShape[]): void {
  if (shapes.length === 0) return;
  for (const s of shapes) {
    const id = pendingKey(txHash, s.asset);
    entries.set(id, { id, txHash, ...s });
  }
  bump();
}

/// Lifecycle-driven clear: remove every entry for `txHash` that ISN'T
/// bound to a balance watermark. Watermark entries self-clear via
/// `pruneByBalances` because their commitment can't be observed by the
/// `ownCommitments` lifecycle (e.g. swap B-note flushed async by the relayer).
export function clearPending(txHash: string): void {
  let removed = false;
  for (const [k, e] of entries) {
    if (e.txHash !== txHash) continue;
    if (e.clearWhenBalanceAtLeast !== undefined) continue;
    entries.delete(k);
    removed = true;
  }
  if (removed) bump();
}

/// Walk watermark-bound entries; clear those whose asset's confirmed
/// balance has reached the threshold. Called by `useWalletState` after
/// each sync so swap B-notes self-clear once the scanner credits them.
export function pruneByBalances(balanceOf: (asset: bigint) => bigint): void {
  let removed = false;
  for (const [k, e] of entries) {
    if (e.clearWhenBalanceAtLeast === undefined) continue;
    if (balanceOf(e.asset) >= e.clearWhenBalanceAtLeast) {
      entries.delete(k);
      removed = true;
    }
  }
  if (removed) bump();
}

/// React hook returning the live map of pending entries.
export function usePending(): ReadonlyMap<string, PendingEntry> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export interface PendingTotals {
  /// Sum of `pendingIn` across all in-flight entries for this asset.
  /// Used to keep the displayed balance stable.
  pendingIn: bigint;
  /// Sum of `outflow` across all in-flight entries. When > 0, the UI
  /// renders the hint as "-outflow settling" (money on its way out);
  /// otherwise as "+pendingIn settling" (money on its way in).
  outflow: bigint;
}

/// Aggregate pending entries per asset. Used by the wallet-state hook to
/// keep balances stable across an in-flight tx and by forms to display
/// the directional "settling" hint. Memoized on the raw snapshot so
/// callers' downstream `useMemo`s don't re-run on every render.
export function usePendingByAsset(): Map<bigint, PendingTotals> {
  const map = usePending();
  return useMemo(() => {
    const out = new Map<bigint, PendingTotals>();
    for (const e of map.values()) {
      const cur = out.get(e.asset) ?? { pendingIn: 0n, outflow: 0n };
      cur.pendingIn += e.pendingIn;
      cur.outflow += e.outflow;
      out.set(e.asset, cur);
    }
    return out;
  }, [map]);
}
