import { useEffect, useState } from "react";

/// `value`, once it has been unchanged for `delayMs`.
///
/// For inputs that drive network reads, where each keystroke would otherwise
/// issue its own request and occupy its own cache entry.
///
/// Callers gating a submit on the result must also test whether it has caught
/// up: a debounced value can describe an input the user has already changed.
/// See `useFeePreview`.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(() => value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
