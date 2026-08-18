// Shared-work pool with explicit ownership of the result.
//
// The problem it solves is narrower than "cache a promise". A wallet build
// produces a `WalletApi` holding scanner workers, each with its own jubjub wasm
// instance, and `scanner.ts` is explicit that nothing but `releaseScanner`
// frees them. So every build has exactly two possible ends: someone adopts it,
// or it is disposed. Dropping it on the floor leaks for the life of the page,
// and an SPA never reloads to reclaim.
//
// That is hard for a consumer to decide alone, because consumers share builds.
// StrictMode mounts, tears down and remounts within one root, so both passes
// await the *same* build; the torn-down pass sees `signal.aborted` and would
// happily dispose the wallet the surviving pass is about to use. "Was this
// superseded?" is a question about the whole set of waiters, so the pool is
// what answers it.
//
// Deliberately free of React and of wallet types: the invariant here is subtle
// enough to be worth testing on its own terms.

export interface SharedWorkPool<T> {
  /// Start (or join) the work for `key`, then offer the result to `adopt`.
  ///
  /// `adopt` reports whether this caller took ownership. Once every caller has
  /// answered and none did, the result is disposed.
  ///
  /// Callers must register **synchronously** — before their first `await` — or
  /// two of them can miss each other: the first would settle and evict the
  /// entry before the second joins, and each would get its own copy of the
  /// work. In an effect, that means calling `run` in the effect body rather
  /// than inside an async function it kicks off.
  run(key: string, make: () => Promise<T>, adopt: (value: T) => Promise<boolean>): Promise<void>;
}

interface Entry<T> {
  promise: Promise<T>;
  /// Callers still deciding whether to take the result.
  waiters: number;
  /// Whether any caller took ownership.
  adopted: boolean;
}

/// A pool that disposes results nobody adopted.
///
/// `dispose` must tolerate being called with a value that was never used, and
/// must not throw — it runs from a `finally` on a path that has no handler.
export function createSharedWorkPool<T>(dispose: (value: T) => void): SharedWorkPool<T> {
  const entries = new Map<string, Entry<T>>();

  return {
    async run(key, make, adopt) {
      let entry = entries.get(key);
      if (!entry) {
        entry = { promise: make(), waiters: 0, adopted: false };
        entries.set(key, entry);
      }
      // Bound before the first await: `entries` may hold a different entry for
      // this key by the time the `finally` runs.
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
          // `produced` rather than `value !== undefined`: `T` may legitimately
          // include `undefined`, and a build that threw has nothing to dispose.
          if (produced && !shared.adopted) dispose(value as T);
        }
      }
    },
  };
}
