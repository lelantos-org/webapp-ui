// Async scaffolding shared by hook and component tests. Provider wrappers live
// in `render.tsx`.

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

/// A promise plus the handles to settle it.
///
/// Holds an async step open across assertions, so a test can observe what the UI
/// reports while the work is in flight.
export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
