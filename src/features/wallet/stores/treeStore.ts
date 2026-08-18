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
/// Stored records to deserialize between yields back to the event loop.
///
/// A full tree requires ~1M leaf parses plus ~350K node parses. Yielding does
/// not reduce that cost; it prevents it forming a single multi-second task
/// blocking paint and input for the duration of a wallet build.
const PARSE_YIELD_EVERY = 64;

/// Hand the event loop a turn. Prefers the scheduler API where it exists; the
/// `setTimeout` fallback is the same idea with a worse priority.
function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/// Counter that yields every `PARSE_YIELD_EVERY` calls and is otherwise a
/// no-op. Awaited per record, so call sites read as a straight loop.
function pacer(): () => Promise<void> {
  let since = 0;
  return async () => {
    if (++since < PARSE_YIELD_EVERY) return;
    since = 0;
    await yieldToMain();
  };
}

/// Every record under `prefix`, as `[suffix, value]` pairs.
///
/// One `getAllKeys` + one `getAll` rather than a `get` per record. A 1M-leaf
/// tree holds ~1000 leaf records and a comparable number of node buckets, and
/// each individual `get` costs its own transaction and structured-clone hop —
/// so a per-record read blocks a wallet build for ~1000 event-loop turns.
///
/// The bound is safe against neighbouring keys: a longer store key sharing this
/// one's prefix continues with a hex digit where the range expects `:`, which
/// sorts above the upper bound. The `:hdr` and `:nodes:` records fall outside a
/// `:leaves:` range for the same reason.
///
/// Both calls run in **one** transaction, so the arrays line up index-for-index.
/// `db.getAllKeys` / `db.getAll` each open their own transaction, which left a
/// window for another tab's `save()` to add a record between them: the arrays
/// then differ in length and every entry past the insertion point is paired
/// with the wrong value. That surfaces as a plausible-looking tree with wrong
/// leaves — a wrong root and a rejected spend — rather than as an error.
///
/// The order is IndexedDB's lexicographic key order and is *not* numeric —
/// `:10` sorts before `:2` — so callers must key off the parsed suffix rather
/// than trusting the sequence.
async function readRange<T>(
  db: IDBPDatabase<WalletSchema>,
  prefix: string,
): Promise<[string, T][]> {
  const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
  const tx = db.transaction(TREE_STORE, "readonly");
  const [keys, values] = await Promise.all([
    tx.store.getAllKeys(range),
    tx.store.getAll(range),
    tx.done,
  ]);
  return keys.map((k, i) => [String(k).slice(prefix.length), values[i] as T]);
}

/// Records from index 0 up to the first missing one.
///
/// Chunks and buckets are written from 0 upwards and never removed, so a hole
/// marks the end of the run rather than something to read past.
///
/// A range read cannot express this: `getAll` returns the records on either
/// side of a hole with nothing to mark it, so walking its result directly
/// joins across the gap and yields a tree that appears whole. The result
/// surfaces later as a wrong Merkle root and a rejected spend, not as an
/// error.
function* contiguousFrom<T>(
  indexed: ReadonlyMap<number, T>,
  limit = Number.POSITIVE_INFINITY,
): Generator<T> {
  for (let i = 0; i < limit; i++) {
    const rec = indexed.get(i);
    if (rec === undefined) return;
    yield rec;
  }
}

/// `"<chunk>"` suffixes to their records. Non-numeric suffixes belong to other
/// key families falling inside the range and are skipped.
function byChunk<T>(records: readonly (readonly [string, T])[]): Map<number, T> {
  const out = new Map<number, T>();
  for (const [suffix, rec] of records) {
    const chunk = Number(suffix);
    if (Number.isInteger(chunk)) out.set(chunk, rec);
  }
  return out;
}

/// `"<level>:<bucket>"` suffixes to their records, grouped by level.
function byLevelAndBucket<T>(
  records: readonly (readonly [string, T])[],
): Map<number, Map<number, T>> {
  const out = new Map<number, Map<number, T>>();
  for (const [suffix, rec] of records) {
    const [level, bucket] = suffix.split(":").map(Number);
    if (!Number.isInteger(level) || !Number.isInteger(bucket)) continue;
    let buckets = out.get(level);
    if (!buckets) {
      buckets = new Map();
      out.set(level, buckets);
    }
    buckets.set(bucket, rec);
  }
  return out;
}

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

    const leaves = await this.loadLeaves(db, hdr.leafCount);
    if (leaves === null) return null;

    this.persistedCount = hdr.syncedCount;

    const state: TreeStoreState = { leaves, syncedCount: hdr.syncedCount };
    if (hdr.depth !== undefined) {
      const nodes = await this.loadNodes(db, hdr.depth);
      if (nodes.length > 0) state.nodes = nodes;
    }
    return state;
  }

  /// Leaves in order, or `null` if the stored records do not account for all
  /// `leafCount` of them — a partially cleared store. Returning the truncated
  /// prefix would present a valid-looking but wrong tree.
  private async loadLeaves(
    db: IDBPDatabase<WalletSchema>,
    leafCount: number,
  ): Promise<bigint[] | null> {
    const chunks = byChunk(await readRange<string[]>(db, `${this.key}:leaves:`));
    const pace = pacer();

    const out: bigint[] = [];
    for (const rec of contiguousFrom(chunks, Math.ceil(leafCount / LEAF_CHUNK))) {
      for (const s of rec) out.push(BigInt(s));
      await pace();
    }
    return out.length === leafCount ? out : null;
  }

  /// Every memoised node, level by level. Levels are read independently, so a
  /// gap in one does not truncate the others.
  private async loadNodes(db: IDBPDatabase<WalletSchema>, depth: number): Promise<MerkleNode[]> {
    const levels = byLevelAndBucket(await readRange<StoredNode[]>(db, `${this.key}:nodes:`));
    const pace = pacer();

    const out: MerkleNode[] = [];
    for (let level = 1; level <= depth; level++) {
      const buckets = levels.get(level);
      if (!buckets) continue;
      for (const rec of contiguousFrom(buckets)) {
        for (const [index, value] of rec) out.push({ level, index, value: BigInt(value) });
        await pace();
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
