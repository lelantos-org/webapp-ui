import { useCallback, useSyncExternalStore } from "react";

/// Whether `query` matches now, re-rendering when that changes. `false` where `matchMedia` is missing.
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = globalThis.matchMedia?.(query);
      media?.addEventListener("change", onChange);
      return () => media?.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => globalThis.matchMedia?.(query).matches ?? false,
    () => false,
  );
}
