import { type IDBPDatabase, openDB } from "idb";
import { IDB_NAME } from "@/shared/lib/storage/keys";

/// Single shared database; every `openDB` must agree on the version or the upgrade deadlocks.
const DB_NAME = IDB_NAME;

/// Bump on any schema change.
const VERSION = 1;

export const NOTE_STORE = "notes";
export const TREE_STORE = "tree";
export const NULLIFIER_STORE = "nullifiers";

const STORES = [NOTE_STORE, TREE_STORE, NULLIFIER_STORE] as const;

/// Values are per-store; each store casts what it reads.
export interface WalletSchema {
  notes: { key: string; value: unknown };
  tree: { key: string; value: unknown };
  nullifiers: { key: string; value: unknown };
}

let dbp: Promise<IDBPDatabase<WalletSchema>> | undefined;

class DatabaseBlockedError extends Error {
  constructor() {
    super("Another tab is using an older version of this wallet. Close it and reload.");
    this.name = "DatabaseBlockedError";
  }
}

/// The shared connection, opened once per tab.
export function walletDb(): Promise<IDBPDatabase<WalletSchema>> {
  if (dbp) return dbp;
  const opening = openDB<WalletSchema>(DB_NAME, VERSION, {
    // Another tab needs a newer version: close and reload rather than strand it.
    blocking(_current, _blocked, event) {
      (event.target as IDBPDatabase<WalletSchema> | null)?.close();
      dbp = undefined;
      if (typeof location !== "undefined") location.reload();
    },
    blocked() {
      throw new DatabaseBlockedError();
    },
    terminated() {
      dbp = undefined;
    },
    upgrade(db) {
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    },
  });
  // Never memoise a rejection: it would fail every later call for the tab's life.
  dbp = opening.catch((e: unknown) => {
    dbp = undefined;
    throw e;
  });
  return dbp;
}
