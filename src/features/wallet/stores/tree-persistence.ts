import type { MerkleNode, TreePersistence, TreeStoreState } from "@lelantos-org/sdk/advanced";
import type { IDBPDatabase, IDBPObjectStore } from "idb";
import { TREE_STORE, type WalletSchema, walletDb } from "./db";

/// Leaves per stored record; matches the server's chunk size.
const LEAF_CHUNK = 1024;
/// Node-cache entries per stored record.
const NODE_BUCKET = 1024;
/// Merkle arity — a node at `level` spans `ARITY ** level` leaves.
const ARITY = 4;
/// Records deserialized between yields to the event loop.
const PARSE_YIELD_EVERY = 64;

function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function pacer(): () => Promise<void> {
  let since = 0;
  return async () => {
    if (++since < PARSE_YIELD_EVERY) return;
    since = 0;
    await yieldToMain();
  };
}

/// Key range covering every record under `prefix`.
function prefixRange(prefix: string): IDBKeyRange {
  return IDBKeyRange.bound(prefix, `${prefix}\uffff`);
}

/// Every record under `prefix` as `[suffix, value]`, in one transaction so keys and values line up.
/// Lexicographic order (`:10` before `:2`).
async function readRange<T>(
  db: IDBPDatabase<WalletSchema>,
  prefix: string,
): Promise<[string, T][]> {
  const range = prefixRange(prefix);
  const tx = db.transaction(TREE_STORE, "readonly");
  const [keys, values] = await Promise.all([
    tx.store.getAllKeys(range),
    tx.store.getAll(range),
    tx.done,
  ]);
  return keys.map((k, i) => [String(k).slice(prefix.length), values[i] as T]);
}

/// Records under `key(0)`, `key(1)`, … up to the first missing one; a hole ends the run.
function* contiguous<T>(
  records: ReadonlyMap<string, T>,
  key: (index: number) => string,
  limit = Number.POSITIVE_INFINITY,
): Generator<T> {
  for (let i = 0; i < limit; i++) {
    const rec = records.get(key(i));
    if (rec === undefined) return;
    yield rec;
  }
}

/// Header record: everything needed to find the chunks belonging to a key.
interface Header {
  syncedCount: number;
  leafCount: number;
  /// Deepest node level persisted; absent when no nodes have been written.
  depth?: number;
}

/// A persisted node: `[index, hexValue]`; the level is implied by its record.
type StoredNode = [number, string];

type TreeWriteStore = IDBPObjectStore<WalletSchema, ["tree"], "tree", "readwrite">;

/// bigint as `0x` hex. The prefix is required: `BigInt` reads bare all-digit hex as decimal.
const enc = (v: bigint): string => `0x${v.toString(16)}`;

/// Chunked, append-only IndexedDB Merkle tree persistence for `connect`'s `treePersistence` option.
export class IdbTreePersistence implements TreePersistence {
  /// `syncedCount` as of the last write; records below it are final.
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

  /// Leaves in order, or `null` if any chunk is missing.
  private async loadLeaves(
    db: IDBPDatabase<WalletSchema>,
    leafCount: number,
  ): Promise<bigint[] | null> {
    const chunks = new Map(await readRange<string[]>(db, `${this.key}:leaves:`));
    const pace = pacer();

    const out: bigint[] = [];
    for (const rec of contiguous(chunks, String, Math.ceil(leafCount / LEAF_CHUNK))) {
      for (const s of rec) out.push(BigInt(s));
      await pace();
    }
    return out.length === leafCount ? out : null;
  }

  private async loadNodes(db: IDBPDatabase<WalletSchema>, depth: number): Promise<MerkleNode[]> {
    const buckets = new Map(await readRange<StoredNode[]>(db, `${this.key}:nodes:`));
    const pace = pacer();

    const out: MerkleNode[] = [];
    for (let level = 1; level <= depth; level++) {
      for (const rec of contiguous(buckets, (bucket) => `${level}:${bucket}`)) {
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
    // Header last, so a torn write never advertises chunks that are absent.
    await store.put(hdr, this.hdrKey());
    await tx.done;

    this.persistedCount = state.syncedCount;
  }

  /// Drop every record under this key so the next `load` rebuilds from the feed.
  /// Must delete, not rewrite: `save` only touches the tail, so diverged chunks would survive.
  async clear(): Promise<void> {
    const db = await walletDb();
    const tx = db.transaction(TREE_STORE, "readwrite");
    await tx.store.delete(prefixRange(`${this.key}:`));
    await tx.done;
    this.persistedCount = 0;
  }

  private async saveNodes(
    store: TreeWriteStore,
    nodes: MerkleNode[],
    firstDirtyLeaf: number,
  ): Promise<void> {
    // Records are replaced whole, so bucket every node, then write only buckets holding a dirty one.
    const byBucket = new Map<string, { entries: StoredNode[]; dirty: boolean }>();

    for (const { level, index, value } of nodes) {
      const key = this.nodeKey(level, Math.floor(index / NODE_BUCKET));
      let rec = byBucket.get(key);
      if (!rec) {
        rec = { entries: [], dirty: false };
        byBucket.set(key, rec);
      }
      rec.entries.push([index, enc(value)]);
      if (index >= Math.floor(firstDirtyLeaf / ARITY ** level)) rec.dirty = true;
    }

    for (const [key, rec] of byBucket) {
      if (rec.dirty) await store.put(rec.entries, key);
    }
  }
}

function maxLevel(nodes: MerkleNode[]): number {
  let hi = 0;
  for (const n of nodes) if (n.level > hi) hi = n.level;
  return hi;
}
