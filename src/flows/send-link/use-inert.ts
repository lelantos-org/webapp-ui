import { type RefObject, useEffect } from "react";

/// Sets the DOM `inert` property on `ref` while `active` (React 18 has no `inert` prop).
export function useInert<T extends HTMLElement>(ref: RefObject<T | null>, active: boolean): void {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.inert = active;
    return () => {
      node.inert = false;
    };
  }, [ref, active]);
}
