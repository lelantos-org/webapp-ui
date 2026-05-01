import type { NoteStore, NotesFile } from "@lelantos-org/sdk";
import { type IDBPDatabase, openDB } from "idb";

const DB_NAME = "sswap-wallet";
const STORE = "notes";
const TREE_STORE = "tree";
// Must match VERSION in treeStore.ts — both stores share `sswap-wallet`. If
// the two openDB calls disagree on version, the lower-version connection
// blocks the higher-version upgrade and openDB hangs with no error.
const VERSION = 2;

interface Schema {
  notes: { key: string; value: NotesFile };
}

export class IdbNoteStore implements NoteStore {
  private dbp: Promise<IDBPDatabase<Schema>>;
  private readonly key: string;

  constructor(addressKey: string) {
    this.key = addressKey;
    this.dbp = openDB<Schema>(DB_NAME, VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(TREE_STORE)) db.createObjectStore(TREE_STORE);
      },
    });
  }

  async load(): Promise<NotesFile> {
    const db = await this.dbp;
    const f = (await db.get(STORE, this.key)) as NotesFile | undefined;
    return f ?? { version: 2, notes: [] };
  }

  async save(file: NotesFile): Promise<void> {
    const db = await this.dbp;
    await db.put(STORE, { version: 2, notes: [...file.notes] }, this.key);
  }
}
