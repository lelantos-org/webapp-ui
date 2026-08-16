import type { MerkleNode, TreePersistence, TreeStoreState } from "@lelantos-org/sdk/wallet";
import type { IDBPDatabase, IDBPObjectStore } from "idb";
import { TREE_STORE, type WalletSchema, walletDb } from "@/features/wallet/stores/db";

/// Leaves per stored record. Matches the server's chunk size, so a sync that
/// pulls one chunk dirties exactly one record.
const LEAF_CHUNK = 1024;
/// Node-cache entries per stored record.
const NODE_BUCKET = 1024;
/// Merkle arity — a node at `level` spans `ARITY ** level` leaves.
const ARITY = 4;

/// Header record: everything needed to find the chunks belonging to a key.
interface Header {
  syncedCount: number;
  leafCount: number;
  /// Deepest node level persisted; absent when no nodes have been written.
  depth?: number;
}

/// A persisted node: `[index, hexValue]`. The level is implied by the record
/// it sits in, so it is not repeated per entry.
type StoredNode = [number, string];

/// The writable `tree` object store inside a transaction.
type TreeWriteStore = IDBPObjectStore<WalletSchema, ["tree"], "tree", "readwrite">;

/// bigint as `0x`-prefixed hex.
///
/// Hex, not decimal: formatting a 254-bit bigint as decimal is repeated
/// division by 10, while hex is a bit-shift, and the result is ~64 chars
/// instead of ~77.
///
/// The `0x` prefix is load-bearing on the way back in: `BigInt` accepts both
/// spellings, so a bare hex string whose digits happened to be all-decimal
/// would read back as a different number.
const enc = (v: bigint): string => `0x${v.toString(16)}`;

/// IndexedDB-backed Merkle tree persistence for the `treePersistence` option
/// of `connect`.
///
/// Append-only and chunked, rather than one record per save. The tree reaches
/// 1M leaves plus ~350K memoised internal nodes, and rewriting all of it on
/// every sync — which also happens on every spend — costs a full serialize of
/// ~100 MB of strings regardless of how many leaves actually changed.
///
/// Both feeds only ever grow at the tail, which is what makes the delta safe
/// to compute rather than diff: a leaf record below `syncedCount` can never
/// change again, and an internal node is final once its whole subtree is
/// filled. So a save rewrites only the records at or after the previous
/// `syncedCount`, turning an O(n) write into O(delta).
export class IdbTreePersistence implements TreePersistence {
  /// `syncedCount` as of the last write, so the next one knows where the
  /// untouched prefix ends. Seeded by `load`.
  private persistedCount = 0;

  constructor(private readonly key: string) {}

  private hdrKey = () => `${this.key}:hdr`;
  private leafKey = (chunk: number) => `${this.key}:leaves:${chunk}`;
  private nodeKey = (level: number, bucket: number) => `${this.key}:nodes:${level}:${bucket}`;

  async load(): Promise<TreeStoreState | null> {
    const db = await walletDb();
    const hdr = (await db.get(TREE_STORE, this.hdrKey())) as Header | undefined;
    if (!hdr) return null;

    const leaves: bigint[] = [];
    const chunks = Math.ceil(hdr.leafCount / LEAF_CHUNK);
    for (let c = 0; c < chunks; c++) {
      const rec = (await db.get(TREE_STORE, this.leafKey(c))) as string[] | undefined;
      if (!rec) break;
      for (const s of rec) leaves.push(BigInt(s));
    }

    // A short read means a record went missing — a partially cleared store.
    // Returning the truncated prefix would present a valid-looking but wrong
    // tree, so treat it as no state and resync.
    if (leaves.length !== hdr.leafCount) return null;

    this.persistedCount = hdr.syncedCount;

    const state: TreeStoreState = { leaves, syncedCount: hdr.syncedCount };
    if (hdr.depth !== undefined) {
      const nodes = await this.loadNodes(db, hdr.depth);
      if (nodes.length > 0) state.nodes = nodes;
    }
    return state;
  }

  /// Buckets are written from 0 upwards and never removed, so the first gap at
  /// a level is the end of that level.
  private async loadNodes(db: IDBPDatabase<WalletSchema>, depth: number): Promise<MerkleNode[]> {
    const out: MerkleNode[] = [];
    for (let level = 1; level <= depth; level++) {
      for (let bucket = 0; ; bucket++) {
        const rec = (await db.get(TREE_STORE, this.nodeKey(level, bucket))) as
          | StoredNode[]
          | undefined;
        if (!rec) break;
        for (const [index, value] of rec) out.push({ level, index, value: BigInt(value) });
      }
    }
    return out;
  }

  async save(state: TreeStoreState): Promise<void> {
    const db = await walletDb();
    const tx = db.transaction(TREE_STORE, "readwrite");
    const store = tx.objectStore(TREE_STORE);

    // Everything before this is already durable and can no longer change.
    const firstDirtyLeaf = Math.min(this.persistedCount, state.leaves.length);
    const firstChunk = Math.floor(firstDirtyLeaf / LEAF_CHUNK);
    const lastChunk = Math.ceil(state.leaves.length / LEAF_CHUNK);

    for (let c = firstChunk; c < lastChunk; c++) {
      const slice = state.leaves.slice(c * LEAF_CHUNK, (c + 1) * LEAF_CHUNK);
      await store.put(slice.map(enc), this.leafKey(c));
    }

    const depth = state.nodes?.length ? maxLevel(state.nodes) : undefined;
    if (state.nodes?.length) await this.saveNodes(store, state.nodes, firstDirtyLeaf);

    const hdr: Header = {
      syncedCount: state.syncedCount,
      leafCount: state.leaves.length,
      ...(depth === undefined ? {} : { depth }),
    };
    // Header last: it is what `load` trusts for the chunk count, so writing it
    // only after the chunks land keeps a torn write from advertising records
    // that are not there.
    await store.put(hdr, this.hdrKey());
    await tx.done;

    this.persistedCount = state.syncedCount;
  }

  private async saveNodes(
    store: TreeWriteStore,
    nodes: MerkleNode[],
    firstDirtyLeaf: number,
  ): Promise<void> {
    // Bucket *every* node, then write only the buckets that contain something
    // new.
    //
    // Both halves matter. Filtering entries before bucketing would drop the
    // clean nodes that share a bucket with a dirty one, since a `put` replaces
    // the whole record — so a bucket is only ever written complete. Skipping
    // wholly-clean buckets is what keeps the write O(delta): a node at `level`
    // covering only leaves below `firstDirtyLeaf` is final, because its
    // subtree is full and the tree only appends.
    const byBucket = new Map<string, { entries: StoredNode[]; dirty: boolean }>();

    for (const { level, index, value } of nodes) {
      const id = `${level}:${Math.floor(index / NODE_BUCKET)}`;
      let rec = byBucket.get(id);
      if (!rec) {
        rec = { entries: [], dirty: false };
        byBucket.set(id, rec);
      }
      rec.entries.push([index, enc(value)]);
      if (index >= Math.floor(firstDirtyLeaf / ARITY ** level)) rec.dirty = true;
    }

    for (const [id, rec] of byBucket) {
      if (!rec.dirty) continue;
      const [level, bucket] = id.split(":").map(Number) as [number, number];
      await store.put(rec.entries, this.nodeKey(level, bucket));
    }
  }
}

/// Deepest level present, which is the tree depth whenever a root has been
/// computed — and the only thing `load` needs in order to know how many levels
/// to read back.
function maxLevel(nodes: MerkleNode[]): number {
  let hi = 0;
  for (const n of nodes) if (n.level > hi) hi = n.level;
  return hi;
}
