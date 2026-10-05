import type { WalletApi } from "@lelantos-org/sdk";
import type { NoteStore, NotesFile } from "@lelantos-org/sdk/advanced";
import type { IDBPObjectStore } from "idb";
import { NOTE_STORE, type WalletSchema, walletDb } from "./db";

/// The notes schema this SDK reads; it rejects any other.
const NOTES_FILE_VERSION: NotesFile["version"] = 3;

const stores = new WeakMap<WalletApi, NoteStore>();

export function holdNoteStore(wallet: WalletApi, store: NoteStore): void {
  stores.set(wallet, store);
}

/// The note store `wallet` was connected with, if this app built it.
export function noteStoreOf(wallet: WalletApi): NoteStore | undefined {
  return stores.get(wallet);
}

/// An empty notes file with no `cursor`, so a sync starts from the feed's beginning.
/// Fresh per call: the SDK mutates it.
export function emptyNotesFile(): NotesFile {
  return { version: NOTES_FILE_VERSION, notes: [] };
}

/// Stored beside the notes record. The sync cursor moves on every page while the notes rarely
/// change, so the cursor is written here alone and the notes are left as they are.
interface NotesMeta {
  /// Names the write that put the notes record there. Another tab's write changes it.
  rev: string;
  /// The current cursor; the notes record's own may be older.
  cursor?: number;
}

type NotesWriteStore = IDBPObjectStore<WalletSchema, ["notes"], "notes", "readwrite">;

const cursorOf = (from: { cursor?: number | undefined }): { cursor?: number } =>
  from.cursor === undefined ? {} : { cursor: from.cursor };

export class IdbNoteStore implements NoteStore {
  private readonly key: string;
  private readonly metaKey: string;
  /// The notes record as this store last read or wrote it: its notes, serialised, and its `rev`.
  private onDisk: { notes: string; rev: string } | undefined;

  constructor(addressKey: string) {
    this.key = addressKey;
    this.metaKey = `${addressKey}:meta`;
  }

  /// A record on another schema reads as empty, forcing a rescan.
  async load(): Promise<NotesFile> {
    const db = await walletDb();
    const tx = db.transaction(NOTE_STORE, "readonly");
    const [stored, meta] = (await Promise.all([
      tx.store.get(this.key),
      tx.store.get(this.metaKey),
      tx.done,
    ])) as [{ version: number } | undefined, NotesMeta | undefined, unknown];

    this.onDisk = undefined;
    if (stored?.version !== NOTES_FILE_VERSION) return emptyNotesFile();
    const file = stored as NotesFile;
    if (!meta) return file;

    this.onDisk = { notes: JSON.stringify(file.notes), rev: meta.rev };
    const { cursor: _stale, ...rest } = file;
    return { ...rest, ...cursorOf(meta) };
  }

  /// Keeps `cursor` (the sync resume point) and `version` exactly as given.
  async save(file: NotesFile): Promise<void> {
    const db = await walletDb();
    const notes = JSON.stringify(file.notes);
    const tx = db.transaction(NOTE_STORE, "readwrite");

    const kept = await this.keptRev(tx.store, notes);
    const rev = kept ?? crypto.randomUUID();
    if (kept === undefined) {
      await tx.store.put(
        { version: file.version, notes: [...file.notes], ...cursorOf(file) },
        this.key,
      );
    }
    await tx.store.put({ rev, ...cursorOf(file) } satisfies NotesMeta, this.metaKey);
    await tx.done;
    this.onDisk = { notes, rev };
  }

  /// The `rev` of the notes record when it can stay as it is: `notes` are the ones this store
  /// put there, and no other tab has replaced them since. Read inside the write transaction: a
  /// record another tab wrote must not be paired with this tab's cursor, which may be past notes
  /// that tab has not found.
  private async keptRev(store: NotesWriteStore, notes: string): Promise<string | undefined> {
    if (this.onDisk?.notes !== notes) return undefined;
    const meta = (await store.get(this.metaKey)) as NotesMeta | undefined;
    return meta?.rev === this.onDisk.rev ? meta.rev : undefined;
  }

  async destroy(): Promise<void> {
    const db = await walletDb();
    const tx = db.transaction(NOTE_STORE, "readwrite");
    await Promise.all([tx.store.delete(this.key), tx.store.delete(this.metaKey), tx.done]);
    this.onDisk = undefined;
  }
}
