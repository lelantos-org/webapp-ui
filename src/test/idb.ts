import { vi } from "vitest";

/// The keys `run` writes to IndexedDB, in order, across every store.
export async function writtenKeys(run: () => Promise<void>): Promise<IDBValidKey[]> {
  const put = vi.spyOn(IDBObjectStore.prototype, "put");
  try {
    await run();
    return put.mock.calls.map(([, key]) => key as IDBValidKey);
  } finally {
    put.mockRestore();
  }
}
