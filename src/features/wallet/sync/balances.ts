import type { WalletNote } from "@lelantos-org/sdk";

/// Confirmed holdings for one asset: what the wallet has decrypted.
///
/// Carries no notion of in-flight value. Including it here would make
/// `features/wallet` depend on `features/tx` and `features/ops`, which already
/// depend on the wallet, and would conflate holdings with expected credits. `useBalances`
/// composes the two.
export interface AssetBalance {
  asset: bigint;
  balance: bigint;
  notes: number;
}

/// One unspent note, as plain data: what a fold over the holdings reads.
///
/// Not the SDK's `WalletNote`, whose `notePayload()` method is a fresh function
/// on every read. React Query's structural sharing keeps a result's identity only
/// when its contents compare equal, so a note carrying a method would hand every
/// poll a new array and recompute everything keyed on it.
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
