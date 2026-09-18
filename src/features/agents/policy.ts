import type { StoredAgent } from "./record";

/// Cap on retained agents, newest kept.
///
/// There is deliberately **no TTL here**, which is the one place this store
/// departs from the claim-link vault. A claim link expires because its key is a
/// liability that should stop existing; an agent's key is the only copy of
/// something still holding funds, so dropping the record would strand them.
///
/// The cap is a different thing from a TTL: it refuses to grow without bound,
/// and `atCapacity` lets the UI say so before a new agent pushes an old one out.
const MAX_RECORDS = 25;

export function newestFirst(a: StoredAgent, b: StoredAgent): number {
  return b.createdAt - a.createdAt;
}

/// The canonical stored form: newest first, capped.
export function normalize(records: readonly StoredAgent[]): StoredAgent[] {
  return [...records].sort(newestFirst).slice(0, MAX_RECORDS);
}

/// Whether one more agent would push the oldest out of storage.
export function atCapacity(records: readonly StoredAgent[]): boolean {
  return records.length >= MAX_RECORDS;
}

/// The record a new agent would evict, if any. Its key would go with it.
export function nextEvicted(records: readonly StoredAgent[]): StoredAgent | undefined {
  if (!atCapacity(records)) return undefined;
  return [...records].sort(newestFirst)[records.length - 1];
}

export { MAX_RECORDS };
