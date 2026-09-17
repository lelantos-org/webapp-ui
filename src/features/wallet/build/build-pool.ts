export interface SharedWorkPool<T> {
  /// Start (or join) the work for `key` and offer the result to `adopt`; disposed if nobody adopts.
  /// Call synchronously before any `await`, or two callers can miss each other and duplicate the work.
  run(key: string, make: () => Promise<T>, adopt: (value: T) => Promise<boolean>): Promise<void>;
}

interface Entry<T> {
  promise: Promise<T>;
  waiters: number;
  adopted: boolean;
}

/// A pool that disposes results no caller adopted. `dispose` must not throw.
export function createSharedWorkPool<T>(dispose: (value: T) => void): SharedWorkPool<T> {
  const entries = new Map<string, Entry<T>>();

  return {
    async run(key, make, adopt) {
      let entry = entries.get(key);
      if (!entry) {
        entry = { promise: make(), waiters: 0, adopted: false };
        entries.set(key, entry);
      }
      const shared = entry;
      shared.waiters += 1;

      let value: T | undefined;
      let produced = false;
      try {
        value = await shared.promise;
        produced = true;
        if (await adopt(value)) shared.adopted = true;
      } finally {
        shared.waiters -= 1;
        if (shared.waiters === 0) {
          if (entries.get(key) === shared) entries.delete(key);
          if (produced && !shared.adopted) dispose(value as T);
        }
      }
    },
  };
}
