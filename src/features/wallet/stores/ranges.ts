import type { IDBPDatabase } from "idb";
import type { WalletSchema } from "./db";

/// Every key starting with `prefix`.
export function prefixRange(prefix: string): IDBKeyRange {
  return IDBKeyRange.bound(prefix, `${prefix}￿`);
}

/// Every record of `store` under `prefix` as `[suffix, value]`, in one transaction so keys and
/// values line up. Lexicographic order (`:10` before `:2`).
export async function readRange<T>(
  db: IDBPDatabase<WalletSchema>,
  store: keyof WalletSchema,
  prefix: string,
): Promise<[string, T][]> {
  const range = prefixRange(prefix);
  const tx = db.transaction(store, "readonly");
  const [keys, values] = await Promise.all([
    tx.store.getAllKeys(range),
    tx.store.getAll(range),
    tx.done,
  ]);
  return keys.map((k, i) => [String(k).slice(prefix.length), values[i] as T]);
}

/// Records under `key(0)`, `key(1)`, … up to the first missing one; a hole ends the run.
export function* contiguous<T>(
  records: ReadonlyMap<string, T>,
  key: (index: number) => string,
  limit = Number.POSITIVE_INFINITY,
): Generator<T> {
  for (let i = 0; i < limit; i++) {
    const rec = records.get(key(i));
    if (rec === undefined) return;
    yield rec;
  }
}
