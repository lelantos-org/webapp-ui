import type { NullifierPersistence, NullifierStoreState } from "@lelantos-org/sdk/advanced";
import type { IDBPDatabase } from "idb";
import { NULLIFIER_STORE, type WalletSchema, walletDb } from "./db";
import { contiguous, readRange } from "./ranges";

/// Nullifiers per stored record.
const CHUNK = 4096;

/// Everything needed to find the chunks belonging to a key.
interface Header {
  /// Entries across all chunks.
  count: number;
  syncedCount: number;
}

/// The layout written before chunking: the whole set in one record under the bare key, as `0x` hex.
interface LegacyState {
  nullifiers: string[];
  syncedCount: number;
}

/// Chunked, append-only IndexedDB spent-set persistence for `connect`'s `storage.nullifiers`
/// option. The set only grows and keeps the feed's order, so a save writes the chunks from the
/// first unsaved entry on, not the whole set.
export class IdbNullifierPersistence implements NullifierPersistence {
  /// Entries on disk as of the last load or save; chunks wholly below it are final.
  private persisted = 0;

  constructor(private readonly key: string) {}

  private hdrKey = () => `${this.key}:hdr`;
  private chunkKey = (chunk: number | "") => `${this.key}:chunk:${chunk}`;

  async load(): Promise<NullifierStoreState | null> {
    const db = await walletDb();
    const hdr = (await db.get(NULLIFIER_STORE, this.hdrKey())) as Header | undefined;
    if (!hdr) return this.loadLegacy(db);

    const chunks = new Map(await readRange<bigint[]>(db, NULLIFIER_STORE, this.chunkKey("")));
    const nullifiers = [...contiguous(chunks, String, Math.ceil(hdr.count / CHUNK))].flat();
    // A missing or short chunk: start over from the feed rather than trust a partial set.
    if (nullifiers.length !== hdr.count) return null;

    this.persisted = hdr.count;
    return { nullifiers, syncedCount: hdr.syncedCount };
  }

  /// Read as nothing saved (`persisted` stays 0), so the next save rewrites it in chunks.
  private async loadLegacy(db: IDBPDatabase<WalletSchema>): Promise<NullifierStoreState | null> {
    const stored = (await db.get(NULLIFIER_STORE, this.key)) as LegacyState | undefined;
    if (!stored) return null;
    return { nullifiers: stored.nullifiers.map((n) => BigInt(n)), syncedCount: stored.syncedCount };
  }

  async save(state: NullifierStoreState): Promise<void> {
    const db = await walletDb();
    const tx = db.transaction(NULLIFIER_STORE, "readwrite");
    const count = state.nullifiers.length;

    // A set shorter than the one on disk is not an append of it: write it whole.
    const first = count >= this.persisted ? Math.floor(this.persisted / CHUNK) : 0;
    for (let c = first; c * CHUNK < count; c++) {
      // IndexedDB stores bigint as it is; no encoding.
      await tx.store.put(state.nullifiers.slice(c * CHUNK, (c + 1) * CHUNK), this.chunkKey(c));
    }
    // Header last, so a torn write never advertises chunks that are absent.
    await tx.store.put({ count, syncedCount: state.syncedCount } satisfies Header, this.hdrKey());
    await tx.store.delete(this.key);
    await tx.done;

    this.persisted = count;
  }
}
