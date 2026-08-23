import { type IDBPDatabase, openDB } from "idb";

/// Single `lelantos-wallet` database shared by the note, tree and nullifier
/// stores.
///
/// Centralised because `openDB` calls that disagree on the version deadlock:
/// the lower-version connection blocks the higher-version upgrade and the
/// promise never settles, with no error. Keeping one version and one upgrade
/// function rules that out *within* a tab.
///
/// Across tabs it cannot: an older tab still holding the previous version
/// blocks this tab's upgrade just the same. That is what `blocked` and
/// `blocking` below are for — without them the identical deadlock reappears,
/// one connection removed, as a wallet build that hangs on `deriving` forever
/// with nothing logged.
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
/// A distinct error type because the fix is the user's, not a retry's: the
/// other tab has to close before this one can open.
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
    /// This tab holds an *older* connection and is standing in the way of a
    /// newer tab's upgrade. Yield: close and reload onto the new build. Doing
    /// nothing here is what strands the other tab indefinitely.
    blocking(_current, _blocked, event) {
      (event.target as IDBPDatabase<WalletSchema> | null)?.close();
      dbp = undefined;
      if (typeof location !== "undefined") location.reload();
    },
    /// The mirror case: *another* tab is holding an older connection, so this
    /// upgrade cannot proceed. Surfacing it as a rejection is the whole point —
    /// left alone the promise simply never settles.
    blocked() {
      throw new DatabaseBlockedError();
    },
    /// The browser killed the connection out from under us (memory pressure,
    /// Safari's background eviction). Drop the memoised handle so the next call
    /// reopens rather than reusing a dead one.
    terminated() {
      dbp = undefined;
    },
    upgrade(db, oldVersion) {
      // Reaching the current version from anything earlier discards the stores
      // rather than migrating them.
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
      // v5 records are keyed by an address written out in full. Re-keying them
      // would mean holding both spellings to find each record, which is the one
      // thing the change is meant to remove — and leaving them would keep the
      // plaintext key names on disk for as long as the wallet is used. Dropping
      // is what actually clears them.
      //
      // Everything here is a cache of chain state, so the cost of dropping it
      // is one resync.
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
  // A rejected promise must not be memoised. `dbp ??=` cached one, so a single
  // transient failure — a blocked upgrade, a browser that killed the connection
  // — poisoned every later call for the life of the tab, with each one
  // re-rejecting on an error that had long since passed.
  dbp = opening.catch((e: unknown) => {
    dbp = undefined;
    throw e;
  });
  return dbp;
}
