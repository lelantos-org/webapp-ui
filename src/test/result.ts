import type { Result } from "@/shared/lib/result";

export function unwrap<T, E>(r: Result<T, E>): T {
  if (!r.ok) throw new Error(`unwrap on error result: ${String(r.error)}`);
  return r.value;
}
