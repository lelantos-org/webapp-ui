// A list of records under one `localStorage` key, read through a snapshot with a stable identity.
// Built for records that hold a secret: a refused write keeps them in memory, not dropped.

import { createSubscribers } from "@/shared/lib/external-store";
import type { Logger } from "@/shared/lib/logger";
import { localStore, readJson, writeJson } from "./safe";

export interface RecordStoreSpec<T> {
  key: string;
  /// Plural name of the records, for log lines.
  noun: string;
  /// Never passed a record: a record may hold a secret.
  log: Logger;
  isRecordArray(value: unknown): value is T[];
  /// The order `snapshot` returns a parsed payload in.
  order(a: T, b: T): number;
}

export interface RecordStore<T> {
  subscribe(listener: () => void): () => void;
  /// Every stored record, in `order`, with a stable identity between changes.
  snapshot(): T[];
  /// Store `records` as given and publish: the only mutation of the cache or `localStorage`.
  persist(records: T[]): void;
  /// The last write did not reach `localStorage`, so every record lives only as long as this tab.
  memoryOnly(): boolean;
  /// Test seam: reset the parsed snapshot and write-refused latch. Pair with `localStorage.clear()`.
  resetForTest(): void;
}

interface Cache<T> {
  /// The raw string `records` was parsed from, keeping snapshot identity for any writer.
  raw: string | undefined;
  /// Stable identity between changes; handed straight to React.
  records: T[];
  /// A write failed: `records` is then the only copy, so storage is not re-read until one lands.
  mirrorOnly: boolean;
}

export function createRecordStore<T>(spec: RecordStoreSpec<T>): RecordStore<T> {
  const { key, noun, log } = spec;
  const cache: Cache<T> = { raw: undefined, records: [], mirrorOnly: false };
  const subscribers = createSubscribers();

  // Another tab may add a record whose secret exists nowhere else.
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key === key || e.key === null) subscribers.notify();
    });
  }

  /// Parse the stored payload. A pure read, safe in render; one bad entry discards all.
  function parse(): T[] {
    const stored = readJson(localStore, key, spec.isRecordArray);
    if (!stored) {
      if (localStore.get(key) !== undefined) {
        log.warn(`stored ${noun} failed validation; treating the store as empty`);
      }
      return [];
    }
    return [...stored].sort(spec.order);
  }

  return {
    subscribe: subscribers.subscribe,

    snapshot() {
      if (cache.mirrorOnly) return cache.records;

      const raw = localStore.get(key);
      if (raw !== cache.raw) {
        cache.raw = raw;
        cache.records = parse();
      }
      return cache.records;
    },

    persist(records) {
      // Set before writing, so the snapshot stays correct if storage refuses the write.
      cache.records = records;

      if (writeJson(localStore, key, records)) {
        cache.raw = localStore.get(key);
        if (cache.mirrorOnly) log.info(`localStorage writable again; ${noun} persist once more`);
        cache.mirrorOnly = false;
      } else if (!cache.mirrorOnly) {
        log.warn(
          `localStorage refused the write — ${records.length} of the ${noun} are held in memory ` +
            "only and will not survive this tab",
        );
        cache.mirrorOnly = true;
      }

      subscribers.notify();
    },

    memoryOnly: () => cache.mirrorOnly,

    resetForTest() {
      cache.raw = undefined;
      cache.records = [];
      cache.mirrorOnly = false;
    },
  };
}
