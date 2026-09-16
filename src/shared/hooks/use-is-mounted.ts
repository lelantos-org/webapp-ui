import { useCallback, useEffect, useRef } from "react";

/// Is the component still mounted?
///
/// For callbacks of long async work — a sweep, a post-success dwell — that
/// resolve after the user may have navigated away. Setting state from one is a
/// no-op React warns about, and in the claim flow the result must be disposed
/// rather than merely dropped, since it holds live scanner workers, so the answer
/// is needed as a value rather than a guard inside a setter.
///
/// Read through a function rather than a ref: a destructured `current` is
/// captured by the closure and stops tracking.
///
/// Re-arms on mount rather than only initialising to `true`, so a remount under
/// StrictMode's double-invoked effects does not leave it permanently false.
export function useIsMounted(): () => boolean {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return useCallback(() => mounted.current, []);
}
