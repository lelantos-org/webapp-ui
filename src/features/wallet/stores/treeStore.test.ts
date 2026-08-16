// Round-trip coverage for the chunked, append-only tree store.
//
// The delta write is computed from `syncedCount` rather than by diffing, so a
// mistake here does not throw — it silently persists a tree whose leaves or
// memoised nodes disagree with what was in memory, which surfaces much later
// as a wrong Merkle root and a rejected transaction. These assert the round
// trip is exact, including across the incremental saves that a real sync does.

import "fake-indexeddb/auto";
import type { MerkleNode, TreeStoreState } from "@lelantos-org/sdk/wallet";
import { beforeEach, describe, expect, it } from "vitest";
import { IdbTreePersistence } from "./treeStore";

const DEPTH = 10;

function leaves(n: number, offset = 0): bigint[] {
  return Array.from({ length: n }, (_, i) => BigInt(i + offset + 1) * 7919n);
}

/// Plausible internal nodes: one per level for the range the leaves cover.
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
  // Fresh namespace per test; the fake IndexedDB persists across cases.
  key = `tree:test:${seq++}`;
});

describe("IdbTreePersistence", () => {
  it("returns null before anything is written", async () => {
    expect(await new IdbTreePersistence(key).load()).toBeNull();
  });

  it("round-trips leaves and nodes across many chunks", async () => {
    // Deliberately not a chunk multiple, so the tail record is partial.
    const s = state(2500);
    await new IdbTreePersistence(key).save(s);

    const got = await new IdbTreePersistence(key).load();

    expect(got?.leaves).toEqual(s.leaves);
    expect(got?.syncedCount).toBe(2500);
    expect(sorted(got?.nodes ?? [])).toEqual(sorted(s.nodes ?? []));
  });

  it("preserves earlier chunks when a later save only appends", async () => {
    // The real failure mode: the second save skips records below the previous
    // `syncedCount`, so if the skip is computed wrong the untouched prefix is
    // lost or stale rather than erroring.
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
    // Older saved states, and any TreeStore that never computed a root.
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
});
