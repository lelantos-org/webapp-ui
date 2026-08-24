import { useCallback, useEffect, useRef } from "react";

/// Is the component still mounted?
///
/// For the callbacks of long async work — a sweep, a post-success dwell — that
/// resolve well after the user may have navigated away. Setting state from one
/// of those is a no-op React warns about, and in the claim flow the result is
/// not merely dropped but has to be *disposed* (a scanner holding live
/// workers), so the answer is needed as a value rather than as a guard baked
/// into a setter.
///
/// Read through a function, not a ref: the ref's `current` is captured by any
/// closure that destructures it, which is exactly the mistake this exists to
/// avoid.
///
/// Re-arms on mount rather than only initialising to `true`, so a remount under
/// React 18 StrictMode's double-invoked effects does not leave it permanently
/// false.
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
