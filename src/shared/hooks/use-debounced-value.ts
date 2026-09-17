import { useEffect, useState } from "react";

/// `value`, once unchanged for `delayMs`. A submit gated on it must check it has caught up.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(() => value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
