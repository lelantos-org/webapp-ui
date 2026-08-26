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
  /// point, and dropping it here would turn every page load back into a full
  /// re-scan of the note feed without any visible symptom.
  ///
  /// `version` is carried through for the same reason. Hardcoding `2` wrote a
  /// future v3 file's payloads under a v2 tag, so `load` would hand the SDK a
  /// mislabelled file — the silent misread this class exists to prevent.
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
  /// For stores that are done with — a swept claim link — where blanking the
  /// value would leave the key behind for the life of the database.
  async destroy(): Promise<void> {
    const db = await walletDb();
    await db.delete(NOTE_STORE, this.key);
  }
}
