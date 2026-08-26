import { type IDBPDatabase, openDB } from "idb";

/// Single `lelantos-wallet` database shared by the note, tree and nullifier
/// stores.
///
/// Centralised because `openDB` calls that disagree on the version deadlock: the
/// lower-version connection blocks the higher-version upgrade and the promise
/// never settles, with no error. One version and one upgrade function rule that
/// out within a tab.
///
/// Across tabs it cannot: an older tab holding the previous version blocks this
/// tab's upgrade the same way. `blocked` and `blocking` below handle that;
/// without them the deadlock reappears as a wallet build that hangs on
/// `deriving` with nothing logged.
const DB_NAME = "lelantos-wallet";

/// Bump on any schema change. History:
///   2 — notes + tree
///   3 — added nullifiers; tree moved to chunked records
///   4 — multichain: records dropped, not migrated
///   5 — nullifiers truncated to 10 bytes; records dropped, not migrated
///   6 — record keys digest the EOA instead of spelling it out; records
///       dropped, not migrated
const VERSION = 6;

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

/// Reported when another tab is holding the database at an older version.
///
/// A distinct error type because the resolution is the user's rather than a
/// retry: the other tab must close before this one can open.
export class DatabaseBlockedError extends Error {
  constructor() {
    super("Another tab is using an older version of this wallet. Close it and reload.");
    this.name = "DatabaseBlockedError";
  }
}

/// The shared connection, opened once per tab.
export function walletDb(): Promise<IDBPDatabase<WalletSchema>> {
  if (dbp) return dbp;
  const opening = openDB<WalletSchema>(DB_NAME, VERSION, {
    /// This tab holds an older connection and is blocking a newer tab's upgrade.
    /// Close and reload onto the new build; doing nothing strands the other tab
    /// indefinitely.
    blocking(_current, _blocked, event) {
      (event.target as IDBPDatabase<WalletSchema> | null)?.close();
      dbp = undefined;
      if (typeof location !== "undefined") location.reload();
    },
    /// The mirror case: another tab holds an older connection, so this upgrade
    /// cannot proceed. Surfaced as a rejection, since the promise would otherwise
    /// never settle.
    blocked() {
      throw new DatabaseBlockedError();
    },
    /// The browser closed the connection (memory pressure, Safari's background
    /// eviction). Drop the memoised handle so the next call reopens rather than
    /// reusing a dead one.
    terminated() {
      dbp = undefined;
    },
    upgrade(db, oldVersion) {
      // Reaching the current version from any earlier one discards the stores
      // rather than migrating them.
      //
      // Pre-v4 records were written by a single-chain build. Their keys carry a
      // chainId, but it came from a build-time constant, so nothing in the data
      // proves which deployment it describes. Re-keying on that assumption risks
      // presenting one chain's notes and Merkle tree as another's, surfacing as
      // a wrong root and a rejected spend rather than an error.
      //
      // v4 records hold full-width nullifiers, which the server no longer sends;
      // the SDK compares against the low 10 bytes, so a kept record would match
      // nothing, the wallet would believe no note was spent, and it would build
      // a double-spend that reverts on chain.
      //
      // v5 records are keyed by a full-length address. Re-keying them would
      // require holding both spellings to find each record, and keeping them
      // would leave plaintext key names on disk for the life of the wallet.
      //
      // Everything here is a cache of chain state, so dropping it costs one
      // resync.
      if (oldVersion > 0 && oldVersion < VERSION) {
        for (const name of STORES) {
          if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
        }
      }
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    },
  });
  // A rejected promise must not be memoised: caching one would let a single
  // transient failure — a blocked upgrade, or a connection the browser closed —
  // reject every later call for the life of the tab.
  dbp = opening.catch((e: unknown) => {
    dbp = undefined;
    throw e;
  });
  return dbp;
}
