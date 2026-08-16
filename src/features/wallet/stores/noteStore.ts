import type { NoteStore, NotesFile } from "@lelantos-org/sdk";
import { NOTE_STORE, walletDb } from "@/features/wallet/stores/db";

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
  async save(file: NotesFile): Promise<void> {
    const db = await walletDb();
    await db.put(
      NOTE_STORE,
      {
        version: 2,
        notes: [...file.notes],
        ...(file.cursor === undefined ? {} : { cursor: file.cursor }),
      },
      this.key,
    );
  }
}
