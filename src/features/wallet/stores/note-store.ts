import type { WalletApi } from "@lelantos-org/sdk";
import type { NoteStore, NotesFile } from "@lelantos-org/sdk/advanced";
import { NOTE_STORE, walletDb } from "./db";

/// The store each wallet was connected with.
///
/// `connect` keeps its storage behind the frozen `WalletApi`, so the one action
/// that writes the store directly — the hard refresh — finds it here. Weak, so a
/// dropped wallet does not keep its entry alive.
const stores = new WeakMap<WalletApi, NoteStore>();

/// Record that `wallet` persists its notes to `store`.
export function holdNoteStore(wallet: WalletApi, store: NoteStore): void {
  stores.set(wallet, store);
}

/// The note store `wallet` was connected with, if this app built it.
export function noteStoreOf(wallet: WalletApi): NoteStore | undefined {
  return stores.get(wallet);
}

/// A notes file with no notes and no `cursor`: a sync from it starts at the
/// beginning of the feed.
///
/// A fresh object per call rather than a shared constant: the SDK mutates the
/// file it loads for the length of a sync.
export function emptyNotesFile(): NotesFile {
  return { version: 1, notes: [] };
}

export class IdbNoteStore implements NoteStore {
  private readonly key: string;

  constructor(addressKey: string) {
    this.key = addressKey;
  }

  /// A record on another schema reads as empty, so the wallet re-scans the
  /// feed rather than failing to open: the SDK does not upgrade files.
  async load(): Promise<NotesFile> {
    const db = await walletDb();
    const f = (await db.get(NOTE_STORE, this.key)) as { version: number } | undefined;
    return f?.version === 1 ? (f as NotesFile) : emptyNotesFile();
  }

  /// `cursor` is rebuilt explicitly rather than spread: it is the sync resume
  /// point, and dropping it would silently turn every page load into a full
  /// re-scan of the note feed.
  ///
  /// `version` is carried through for the same reason. Hardcoding it would write
  /// a later file's payloads under an earlier tag, so `load` would hand the SDK a
  /// mislabelled file.
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
  ///
  /// For stores that are finished with, such as a swept claim link, where
  /// blanking the value would leave the key behind for the life of the database.
  async destroy(): Promise<void> {
    const db = await walletDb();
    await db.delete(NOTE_STORE, this.key);
  }
}
