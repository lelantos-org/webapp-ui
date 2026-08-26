import type { NullifierPersistence, NullifierStoreState } from "@lelantos-org/sdk/wallet";
import { NULLIFIER_STORE, walletDb } from "./db";

interface StoredState {
  nullifiers: string[]; // bigint as hex; see `treeStore.ts` for why not decimal
  syncedCount: number;
}

/// IndexedDB-backed spent-set persistence for the `nullifierPersistence`
/// option of `connect`.
///
/// Without it the SDK keeps the set in memory only, so every page load re-walks
/// the entire nullifier chunk feed from chunk 0 — the whole spent set, on every
/// open.
export class IdbNullifierPersistence implements NullifierPersistence {
  constructor(private readonly key: string) {}

  async load(): Promise<NullifierStoreState | null> {
    const db = await walletDb();
    const stored = (await db.get(NULLIFIER_STORE, this.key)) as StoredState | undefined;
    if (!stored) return null;
    return {
      nullifiers: stored.nullifiers.map((n) => BigInt(n)),
      syncedCount: stored.syncedCount,
    };
  }

  async save(state: NullifierStoreState): Promise<void> {
    const db = await walletDb();
    await db.put(
      NULLIFIER_STORE,
      {
        nullifiers: state.nullifiers.map((n) => `0x${n.toString(16)}`),
        syncedCount: state.syncedCount,
      },
      this.key,
    );
  }
}
