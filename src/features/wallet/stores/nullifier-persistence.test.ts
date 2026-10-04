import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { writtenKeys } from "@/test/idb";
import { NULLIFIER_STORE, walletDb } from "./db";
import { IdbNullifierPersistence } from "./nullifier-persistence";

/// Entries per stored record; mirrors the store's own.
const CHUNK = 4096;

const set = (n: number) => Array.from({ length: n }, (_, i) => BigInt(i + 1) * 104_729n);

const state = (n: number, syncedCount = n) => ({ nullifiers: set(n), syncedCount });

let seq = 0;
let key: string;

beforeEach(() => {
  key = `nullifiers:test:${seq++}`;
});

describe("IdbNullifierPersistence", () => {
  it("returns null before anything is written", async () => {
    expect(await new IdbNullifierPersistence(key).load()).toBeNull();
  });

  it("round-trips a set spanning several records, in order", async () => {
    // `syncedCount` runs ahead of the set: the feed repeats entries the set holds once.
    const s = state(2 * CHUNK + 10, 2 * CHUNK + 25);
    await new IdbNullifierPersistence(key).save(s);
    expect(await new IdbNullifierPersistence(key).load()).toEqual(s);
  });

  it("writes only the records from the first unsaved entry on", async () => {
    const store = new IdbNullifierPersistence(key);
    await store.save(state(2 * CHUNK + 10));

    const keys = await writtenKeys(() => store.save(state(2 * CHUNK + 50)));

    expect(keys).toEqual([`${key}:chunk:2`, `${key}:hdr`]);
    expect(await new IdbNullifierPersistence(key).load()).toEqual(state(2 * CHUNK + 50));
  });

  it("appends after a load as it does after a save", async () => {
    await new IdbNullifierPersistence(key).save(state(CHUNK + 5));
    const store = new IdbNullifierPersistence(key);
    await store.load();

    const keys = await writtenKeys(() => store.save(state(CHUNK + 6)));

    expect(keys).toEqual([`${key}:chunk:1`, `${key}:hdr`]);
  });

  it("writes a set shorter than the one on disk whole", async () => {
    const store = new IdbNullifierPersistence(key);
    await store.save(state(CHUNK + 5));
    await store.save(state(3));
    expect(await new IdbNullifierPersistence(key).load()).toEqual(state(3));
  });

  it("starts over when a record is missing", async () => {
    await new IdbNullifierPersistence(key).save(state(CHUNK + 5));
    const db = await walletDb();
    await db.delete(NULLIFIER_STORE, `${key}:chunk:0`);
    expect(await new IdbNullifierPersistence(key).load()).toBeNull();
  });

  it("reads the single-record layout, then replaces it on the next save", async () => {
    const db = await walletDb();
    const legacy = { nullifiers: set(3).map((n) => `0x${n.toString(16)}`), syncedCount: 3 };
    await db.put(NULLIFIER_STORE, legacy, key);

    const store = new IdbNullifierPersistence(key);
    expect(await store.load()).toEqual(state(3));

    await store.save(state(4));
    expect(await db.get(NULLIFIER_STORE, key)).toBeUndefined();
    expect(await new IdbNullifierPersistence(key).load()).toEqual(state(4));
  });
});
