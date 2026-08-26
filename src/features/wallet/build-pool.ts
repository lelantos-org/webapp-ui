// Shared-work pool with explicit ownership of the result.
//
// Narrower than caching a promise. A wallet build produces a `WalletApi` holding
// scanner workers, each with its own jubjub wasm instance, and only
// `releaseScanner` frees them (see `scanner.ts`). Every build therefore ends one
// of two ways: a caller adopts it, or it is disposed. Dropping it leaks for the
// life of the page, which an SPA never reloads to reclaim.
//
// A single consumer cannot decide this, because consumers share builds.
// StrictMode mounts, tears down and remounts within one root, so both passes
// await the same build; the torn-down pass sees `signal.aborted` and would
// dispose the wallet the surviving pass is about to use. Whether a build was
// superseded is a property of the whole waiter set, which the pool tracks.
//
// Free of React and of wallet types, so the invariant can be tested on its own.

export interface SharedWorkPool<T> {
  /// Start (or join) the work for `key`, then offer the result to `adopt`.
  ///
  /// `adopt` reports whether this caller took ownership. Once every caller has
  /// answered and none did, the result is disposed.
  ///
  /// Callers must register synchronously, before their first `await`, or two can
  /// miss each other: the first would settle and evict the entry before the
  /// second joined, giving each its own copy of the work. In an effect, call
  /// `run` from the effect body rather than from an async function it starts.
  run(key: string, make: () => Promise<T>, adopt: (value: T) => Promise<boolean>): Promise<void>;
}

interface Entry<T> {
  promise: Promise<T>;
  /// Callers still deciding whether to take the result.
  waiters: number;
  /// Whether any caller took ownership.
  adopted: boolean;
}

/// A pool that disposes results no caller adopted.
///
/// `dispose` must tolerate a value that was never used and must not throw: it
/// runs from a `finally` on a path with no handler.
export function createSharedWorkPool<T>(dispose: (value: T) => void): SharedWorkPool<T> {
  const entries = new Map<string, Entry<T>>();

  return {
    async run(key, make, adopt) {
      let entry = entries.get(key);
      if (!entry) {
        entry = { promise: make(), waiters: 0, adopted: false };
        entries.set(key, entry);
      }
      // Bound before the first await, since `entries` may hold a different entry
      // for this key by the time the `finally` runs.
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
          // `produced` rather than `value !== undefined`: `T` may include
          // `undefined`, and a build that threw has nothing to dispose.
          if (produced && !shared.adopted) dispose(value as T);
        }
      }
    },
  };
}
