import { useCallback, useEffect, useRef } from "react";

/// A getter for whether the component is still mounted, for callbacks of long async work.
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
