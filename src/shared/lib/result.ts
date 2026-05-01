/// Discriminated-union Result type. Convention: wrap synchronous parsers /
/// validators; keep async + SDK errors on the throw path.

export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/// Map the success value. Failures pass through unchanged.
export function map<T, U, E>(r: Result<T, E>, f: (t: T) => U): Result<U, E> {
  return r.ok ? ok(f(r.value)) : r;
}

/// Map the error. Successes pass through unchanged.
export function mapErr<T, E, F>(r: Result<T, E>, f: (e: E) => F): Result<T, F> {
  return r.ok ? r : err(f(r.error));
}

/// Chain another fallible step. Short-circuits on failure.
export function andThen<T, U, E>(r: Result<T, E>, f: (t: T) => Result<U, E>): Result<U, E> {
  return r.ok ? f(r.value) : r;
}

/// Convert a throwing function call to a Result.
export function tryCatch<T>(fn: () => T): Result<T, string> {
  try {
    return ok(fn());
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

/// Unwrap the value or throw a descriptive error. Reserved for boundary points
/// where the caller has already proven the result is ok (e.g. tests).
export function unwrap<T, E>(r: Result<T, E>): T {
  if (!r.ok) throw new Error(`unwrap on error result: ${String(r.error)}`);
  return r.value;
}
