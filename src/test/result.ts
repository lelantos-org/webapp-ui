// `Result` helpers only tests need.

import type { Result } from "@/shared/lib/result";

/// The value of a result the test has already proven ok, or a throw naming the
/// error — so a failed precondition reads as its cause, not as a later `undefined`.
export function unwrap<T, E>(r: Result<T, E>): T {
  if (!r.ok) throw new Error(`unwrap on error result: ${String(r.error)}`);
  return r.value;
}
