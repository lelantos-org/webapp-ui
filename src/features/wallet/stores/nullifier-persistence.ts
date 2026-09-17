import type { NullifierPersistence, NullifierStoreState } from "@lelantos-org/sdk/advanced";
import { NULLIFIER_STORE, walletDb } from "./db";

interface StoredState {
  nullifiers: string[]; // bigint as 0x hex
  syncedCount: number;
}

/// IndexedDB spent-set persistence for `connect`'s `nullifierPersistence` option.
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
