import type { TreePersistence, TreeStoreState } from "@lelantos-org/sdk/wallet";
import { type IDBPDatabase, openDB } from "idb";

const DB_NAME = "sswap-wallet";
const TREE_STORE = "tree";
// Must match VERSION in noteStore.ts — both stores share `sswap-wallet`.
const VERSION = 2;

interface StoredState {
  leaves: string[]; // bigint stored as decimal strings; format change requires a VERSION bump
  syncedCount: number;
}

interface Schema {
  tree: { key: string; value: StoredState };
}

/// IndexedDB-backed Merkle tree persistence for `Wallet.connect`'s
/// `treePersistence` option; the SDK loads state at startup and saves after
/// every sync.
export class IdbTreePersistence implements TreePersistence {
  private readonly dbp: Promise<IDBPDatabase<Schema>>;

  constructor(private readonly key: string) {
    this.dbp = openDB<Schema>(DB_NAME, VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("notes")) db.createObjectStore("notes");
        if (!db.objectStoreNames.contains(TREE_STORE)) {
          db.createObjectStore(TREE_STORE);
        }
      },
    });
  }

  async load(): Promise<TreeStoreState | null> {
    const db = await this.dbp;
    const stored = await db.get(TREE_STORE, this.key);
    if (!stored) return null;
    return { leaves: stored.leaves.map(BigInt), syncedCount: stored.syncedCount };
  }

  async save(state: TreeStoreState): Promise<void> {
    const db = await this.dbp;
    await db.put(
      TREE_STORE,
      { leaves: state.leaves.map(String), syncedCount: state.syncedCount },
      this.key,
    );
  }
}
