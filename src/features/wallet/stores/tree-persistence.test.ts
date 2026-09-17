import "fake-indexeddb/auto";
import type { MerkleNode, TreeStoreState } from "@lelantos-org/sdk/advanced";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TREE_STORE, walletDb } from "./db";
import { IdbTreePersistence } from "./tree-persistence";

const DEPTH = 10;

function leaves(n: number, offset = 0): bigint[] {
  return Array.from({ length: n }, (_, i) => BigInt(i + offset + 1) * 7919n);
}

function nodes(leafCount: number): MerkleNode[] {
  const out: MerkleNode[] = [];
  for (let level = 1; level <= DEPTH; level++) {
    const count = Math.ceil(leafCount / 4 ** level);
    for (let index = 0; index < count; index++) {
      out.push({ level, index, value: BigInt(level * 1_000_003 + index) });
    }
  }
  return out;
}

function state(leafCount: number): TreeStoreState {
  return {
    leaves: leaves(leafCount),
    syncedCount: leafCount,
    nodes: nodes(leafCount),
  };
}

function sorted(xs: MerkleNode[]): MerkleNode[] {
  return [...xs].sort((a, b) => a.level - b.level || a.index - b.index);
}

let seq = 0;
let key: string;

beforeEach(() => {
  key = `tree:test:${seq++}`;
});

describe("IdbTreePersistence", () => {
  it("returns null before anything is written", async () => {
    expect(await new IdbTreePersistence(key).load()).toBeNull();
  });

  it("round-trips leaves and nodes across many chunks", async () => {
    const s = state(2500);
    await new IdbTreePersistence(key).save(s);

    const got = await new IdbTreePersistence(key).load();

    expect(got?.leaves).toEqual(s.leaves);
    expect(got?.syncedCount).toBe(2500);
    expect(sorted(got?.nodes ?? [])).toEqual(sorted(s.nodes ?? []));
  });

  it("preserves earlier chunks when a later save only appends", async () => {
    const p = new IdbTreePersistence(key);
    await p.save(state(1500));
    await p.save(state(3000));

    const got = await new IdbTreePersistence(key).load();

    expect(got?.leaves).toEqual(leaves(3000));
    expect(got?.syncedCount).toBe(3000);
    expect(sorted(got?.nodes ?? [])).toEqual(sorted(nodes(3000)));
  });

  it("matches a single write after a sequence of incremental ones", async () => {
    const incremental = new IdbTreePersistence(`${key}:inc`);
    for (const n of [1024, 2048, 2600, 4096]) {
      await incremental.save(state(n));
    }
    const stepwise = await new IdbTreePersistence(`${key}:inc`).load();

    await new IdbTreePersistence(`${key}:one`).save(state(4096));
    const oneShot = await new IdbTreePersistence(`${key}:one`).load();

    expect(stepwise?.leaves).toEqual(oneShot?.leaves);
    expect(sorted(stepwise?.nodes ?? [])).toEqual(sorted(oneShot?.nodes ?? []));
  });

  it("round-trips a state with no nodes", async () => {
    await new IdbTreePersistence(key).save({ leaves: leaves(50), syncedCount: 50 });

    const got = await new IdbTreePersistence(key).load();

    expect(got?.leaves).toEqual(leaves(50));
    expect(got?.nodes).toBeUndefined();
  });

  it("survives a save that adds no leaves", async () => {
    const p = new IdbTreePersistence(key);
    await p.save(state(1200));
    await p.save(state(1200));

    const got = await new IdbTreePersistence(key).load();

    expect(got?.leaves).toEqual(leaves(1200));
    expect(sorted(got?.nodes ?? [])).toEqual(sorted(nodes(1200)));
  });

  it("returns null when a leaf chunk in the middle is missing", async () => {
    await new IdbTreePersistence(key).save(state(2500));

    const db = await walletDb();
    await db.delete(TREE_STORE, `${key}:leaves:1`);

    expect(await new IdbTreePersistence(key).load()).toBeNull();
  });

  it("stops at the first gap within a node level and keeps deeper levels", async () => {
    // 8192 leaves put 2048 level-1 nodes across two buckets.
    await new IdbTreePersistence(key).save(state(8192));

    const db = await walletDb();
    await db.delete(TREE_STORE, `${key}:nodes:1:1`);

    const got = await new IdbTreePersistence(key).load();
    const byLevel = (lvl: number) => (got?.nodes ?? []).filter((n) => n.level === lvl);

    expect(byLevel(1).map((n) => n.index)).toEqual(Array.from({ length: 1024 }, (_, i) => i));
    expect(sorted(byLevel(2))).toEqual(sorted(nodes(8192).filter((n) => n.level === 2)));
  });
});

describe("readRange transaction scope", () => {
  it("reads keys and values in a single transaction", async () => {
    // Pins the single-transaction read; a real cross-tab interleave is not deterministic.
    const p = new IdbTreePersistence("tx-scope");
    await p.save({ leaves: leaves(2048), syncedCount: 2048, nodes: nodes(2048) });

    const db = await walletDb();
    const dbGetAll = vi.spyOn(db, "getAll");
    const dbGetAllKeys = vi.spyOn(db, "getAllKeys");
    const transaction = vi.spyOn(db, "transaction");

    const loaded = await p.load();

    expect(loaded?.leaves).toHaveLength(2048);
    expect(dbGetAll).not.toHaveBeenCalled();
    expect(dbGetAllKeys).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalled();
  });
});
