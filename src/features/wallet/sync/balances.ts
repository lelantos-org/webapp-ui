import type { WalletNote } from "@lelantos-org/sdk";

/// Confirmed holdings for one asset (no in-flight value; `useBalances` adds that).
export interface AssetBalance {
  asset: bigint;
  balance: bigint;
  notes: number;
}

/// One unspent note as plain data, so React Query's structural sharing keeps its identity.
export interface HeldNote {
  asset: bigint;
  value: bigint;
  firstSeenBlock?: number | undefined;
}

/// The plain view of the wallet's unspent notes.
export function heldNotes(notes: readonly WalletNote[]): HeldNote[] {
  return notes.map((n) => ({
    asset: n.asset,
    value: n.value,
    ...(n.firstSeenBlock === undefined ? {} : { firstSeenBlock: n.firstSeenBlock }),
  }));
}

/// Total unspent notes per asset, in asset order.
export function computeBalances(notes: readonly HeldNote[]): AssetBalance[] {
  const byAsset = new Map<bigint, AssetBalance>();
  for (const n of notes) {
    const cur = byAsset.get(n.asset) ?? { asset: n.asset, balance: 0n, notes: 0 };
    cur.balance += n.value;
    cur.notes += 1;
    byAsset.set(n.asset, cur);
  }
  return [...byAsset.values()].sort((a, b) => Number(a.asset - b.asset));
}
