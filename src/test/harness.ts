// Async scaffolding shared by hook and component tests, and the `Result`
// helpers only tests need. Provider wrappers live in `render.tsx`.

import type { Result } from "@/shared/lib/result";

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

/// The value of a result the test has already proven ok, or a throw naming the
/// error — so a failed precondition reads as its cause, not as a later `undefined`.
export function unwrap<T, E>(r: Result<T, E>): T {
  if (!r.ok) throw new Error(`unwrap on error result: ${String(r.error)}`);
  return r.value;
}
