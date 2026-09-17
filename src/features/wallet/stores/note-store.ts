import type { WalletApi } from "@lelantos-org/sdk";
import type { NoteStore, NotesFile } from "@lelantos-org/sdk/advanced";
import { NOTE_STORE, walletDb } from "./db";

const stores = new WeakMap<WalletApi, NoteStore>();

/// Record that `wallet` persists its notes to `store`.
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
  return { version: 1, notes: [] };
}

export class IdbNoteStore implements NoteStore {
  private readonly key: string;

  constructor(addressKey: string) {
    this.key = addressKey;
  }

  /// A record on another schema reads as empty, forcing a rescan.
  async load(): Promise<NotesFile> {
    const db = await walletDb();
    const f = (await db.get(NOTE_STORE, this.key)) as { version: number } | undefined;
    return f?.version === 1 ? (f as NotesFile) : emptyNotesFile();
  }

  /// Keeps `cursor` (the sync resume point) and `version` exactly as given.
  async save(file: NotesFile): Promise<void> {
    const db = await walletDb();
    await db.put(
      NOTE_STORE,
      {
        version: file.version,
        notes: [...file.notes],
        ...(file.cursor === undefined ? {} : { cursor: file.cursor }),
      },
      this.key,
    );
  }

  /// Remove this wallet's record entirely.
  async destroy(): Promise<void> {
    const db = await walletDb();
    await db.delete(NOTE_STORE, this.key);
  }
}
