// Keyed by (chain, operation, asset): bundled operations share a tx hash, and asset ids are per chain.

import { useMemo } from "react";
import { chainKey } from "@/config/chains/types";
import { createStore, useStore } from "@/shared/lib/external-store";
import type { PendingOp } from "./operation";

export interface PendingShape {
  /// Asset id this entry credits.
  asset: bigint;
  /// Amount expected back once the scanner indexes the own outputs.
  pendingIn: bigint;
  /// Amount leaving the wallet. Determines the sign of the settling hint.
  outflow: bigint;
  /// Balance watermark for outputs the lifecycle cannot observe; the entry clears once it is crossed.
  clearWhenBalanceAtLeast?: bigint;
}

export interface PendingEntry extends PendingShape, PendingOp {
  /// Composite key `${chainId}:${opId}:${asset}`.
  id: string;
  /// Chain the tx was submitted on.
  chainId: bigint;
  /// Deadline, set only on watermark-bound entries.
  expiresAt?: number | undefined;
}

/// Lifetime of a watermark-bound entry, so an output never flushed cannot keep it alive.
const WATERMARK_TTL_MS = 10 * 60_000;

function expiryOf(shape: PendingShape): number | undefined {
  return shape.clearWhenBalanceAtLeast === undefined ? undefined : Date.now() + WATERMARK_TTL_MS;
}

const entries = new Map<string, PendingEntry>();

/// Snapshot of `entries` for React, replaced on each change.
const store = createStore<ReadonlyMap<string, PendingEntry>>(new Map());

function bump() {
  store.setState(new Map(entries));
}

function pendingKey(chainId: bigint, opId: string, asset: bigint): string {
  return `${chainKey(chainId)}:${opId}:${asset}`;
}

/// Bulk add, with a single `bump()` so subscribers see every entry in one tick.
export function addPendingMany(chainId: bigint, op: PendingOp, shapes: PendingShape[]): void {
  if (shapes.length === 0) return;
  for (const s of shapes) {
    const id = pendingKey(chainId, op.opId, s.asset);
    entries.set(id, { id, chainId, ...op, ...s, expiresAt: expiryOf(s) });
  }
  bump();
}

/// Clear operation `opId`'s entries, except watermark-bound ones (`pruneByBalances` clears those).
export function clearPending(chainId: bigint, opId: string): void {
  let removed = false;
  for (const [k, e] of entries) {
    if (e.chainId !== chainId || e.opId !== opId) continue;
    if (e.clearWhenBalanceAtLeast !== undefined) continue;
    entries.delete(k);
    removed = true;
  }
  if (removed) bump();
}

/// Clear watermark-bound entries on `chainId` whose asset balance has reached the threshold.
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
  return useStore(store);
}

export interface PendingTotals {
  /// Sum of `pendingIn` across in-flight entries for this asset.
  pendingIn: bigint;
  /// Sum of `outflow`; when positive the hint reads `-outflow settling`.
  outflow: bigint;
}

/// Pending totals per asset on `chainId`, memoised on the store snapshot.
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
