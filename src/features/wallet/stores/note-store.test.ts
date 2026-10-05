import "fake-indexeddb/auto";
import type { NotesFile } from "@lelantos-org/sdk/advanced";
import { beforeEach, describe, expect, it } from "vitest";
import { writtenKeys } from "@/test/idb";
import { NOTE_STORE, walletDb } from "./db";
import { IdbNoteStore } from "./note-store";

type Note = NotesFile["notes"][number];

function note(id: string, over: Partial<Note> = {}): Note {
  return {
    id,
    asset: "0x1",
    value: "0x5",
    rho: "0x2",
    rcm: "0x3",
    d: "0",
    cm: `0x${id}`,
    leafIndex: 0,
    spent: false,
    discoveredAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

const file = (notes: Note[], cursor?: number): NotesFile => ({
  version: 3,
  notes,
  ...(cursor === undefined ? {} : { cursor }),
});

let seq = 0;
let key: string;

beforeEach(() => {
  key = `notes:test:${seq++}`;
});

describe("IdbNoteStore", () => {
  it("reads as empty, with no cursor, before anything is written", async () => {
    expect(await new IdbNoteStore(key).load()).toEqual(file([]));
  });

  it("round-trips the notes and the cursor", async () => {
    await new IdbNoteStore(key).save(file([note("a"), note("b")], 7));
    expect(await new IdbNoteStore(key).load()).toEqual(file([note("a"), note("b")], 7));
  });

  it("moves the cursor without rewriting notes that did not change", async () => {
    const store = new IdbNoteStore(key);
    await store.save(file([note("a")], 1));

    const keys = await writtenKeys(() => store.save(file([note("a")], 2)));

    expect(keys).toEqual([`${key}:meta`]);
    expect(await new IdbNoteStore(key).load()).toEqual(file([note("a")], 2));
  });

  it("writes the notes again once one changes in place", async () => {
    const store = new IdbNoteStore(key);
    const notes = [note("a")];
    await store.save(file(notes, 1));

    (notes[0] as Note).spent = true;
    await store.save(file(notes, 1));

    expect((await new IdbNoteStore(key).load()).notes[0]?.spent).toBe(true);
  });

  it("drops a cursor the file no longer carries", async () => {
    const store = new IdbNoteStore(key);
    await store.save(file([note("a")], 4));
    await store.save(file([note("a")]));
    expect((await new IdbNoteStore(key).load()).cursor).toBeUndefined();
  });

  it("never pairs its cursor with notes another tab wrote", async () => {
    const mine = new IdbNoteStore(key);
    await mine.save(file([note("a"), note("b")], 9));
    // The other tab has scanned less and holds fewer notes.
    await new IdbNoteStore(key).save(file([note("a")], 3));

    await mine.save(file([note("a"), note("b")], 10));

    expect(await new IdbNoteStore(key).load()).toEqual(file([note("a"), note("b")], 10));
  });

  it("reads a record written before the cursor had its own", async () => {
    const db = await walletDb();
    await db.put(NOTE_STORE, file([note("a")], 5), key);

    const store = new IdbNoteStore(key);
    expect(await store.load()).toEqual(file([note("a")], 5));

    await store.save(file([note("a")], 6));
    expect(await new IdbNoteStore(key).load()).toEqual(file([note("a")], 6));
  });

  it("reads a record on another schema as empty", async () => {
    const db = await walletDb();
    await db.put(NOTE_STORE, { version: 1, notes: [note("a")], cursor: 5 }, key);
    expect(await new IdbNoteStore(key).load()).toEqual(file([]));
  });

  it("leaves nothing behind once destroyed", async () => {
    const store = new IdbNoteStore(key);
    await store.save(file([note("a")], 1));
    await store.destroy();

    const db = await walletDb();
    expect(await db.getAllKeys(NOTE_STORE, IDBKeyRange.bound(key, `${key}￿`))).toEqual([]);
    expect(await store.load()).toEqual(file([]));
  });
});
