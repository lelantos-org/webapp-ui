import { type IDBPDatabase, openDB } from "idb";

/// Single `lelantos-wallet` database shared by the note, tree and nullifier
/// stores.
///
/// Centralised because `openDB` calls that disagree on the version deadlock:
/// the lower-version connection blocks the higher-version upgrade and the
/// promise never settles, with no error. Keeping one version and one upgrade
/// function makes that impossible rather than merely documented.
const DB_NAME = "lelantos-wallet";

/// Bump on any schema change. History:
///   2 — notes + tree
///   3 — added nullifiers; tree moved to chunked records
///   4 — multichain: records dropped, not migrated
///   5 — nullifiers truncated to 10 bytes; records dropped, not migrated
const VERSION = 5;

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

/// The shared connection, opened once per tab.
export function walletDb(): Promise<IDBPDatabase<WalletSchema>> {
  dbp ??= openDB<WalletSchema>(DB_NAME, VERSION, {
    upgrade(db, oldVersion) {
      // Reaching v5 from anything earlier discards the stores rather than
      // migrating them.
      //
      // Pre-v4 records were written by a build that could only ever talk to
      // one chain, and while their keys carry a chainId, that id came from a
      // build-time constant — so nothing in the data proves which deployment
      // it actually describes. Re-keying on that assumption risks presenting
      // one chain's notes and Merkle tree as another's, which surfaces as a
      // wrong root and a rejected spend rather than as an error.
      //
      // v4 records hold full-width nullifiers, which the server no longer
      // sends; the SDK now compares against the low 10 bytes, so a kept record
      // would match nothing and the wallet would believe no note was ever
      // spent — then build a double-spend that reverts on chain. Dropping is
      // what makes that unrepresentable rather than merely detectable.
      //
      // Everything here is a cache of chain state, so the cost of dropping it
      // is one resync.
      if (oldVersion > 0 && oldVersion < 5) {
        for (const name of STORES) {
          if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
        }
      }
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    },
  });
  return dbp;
}
