import type { StoredAgent } from "./record";

/// Cap on retained agents, newest kept. Records have no TTL: an agent's key may be
/// the only copy of something still holding funds.
const MAX_RECORDS = 25;

export function newestFirst(a: StoredAgent, b: StoredAgent): number {
  return b.createdAt - a.createdAt;
}

/// The stored form: newest first, capped.
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
