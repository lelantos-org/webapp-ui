import type { NoteStore, NotesFile } from "@lelantos-org/sdk";
import { NOTE_STORE, walletDb } from "./db";

export class IdbNoteStore implements NoteStore {
  private readonly key: string;

  constructor(addressKey: string) {
    this.key = addressKey;
  }

  async load(): Promise<NotesFile> {
    const db = await walletDb();
    const f = (await db.get(NOTE_STORE, this.key)) as NotesFile | undefined;
    return f ?? { version: 2, notes: [] };
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
