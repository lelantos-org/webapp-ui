import { type RefObject, useEffect } from "react";

/// Makes a subtree unfocusable and unclickable while `active`.
///
/// `Modal` traps Tab within its own panel, but it renders through a portal, so
/// the form it covers is a sibling rather than a descendant — nothing stops the
/// pointer, and a screen reader's own navigation is not bound by the trap
/// either. `inert` is the one thing that removes a subtree from all of them at
/// once.
///
/// A hook rather than the JSX attribute: React 18 has no first-class `inert`
/// prop, so writing it in JSX yields either a warning or a stringified
/// attribute that does nothing. Setting the DOM property sidesteps both.
///
/// Needs Chrome 102+, Safari 15.5+ or Firefox 112+. Older engines ignore the
/// assignment, which is the right way to fail here: callers still guard
/// correctness separately — see the `pending` snapshot in `GenerateLinkForm` —
/// so this only ever adds a second layer.
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
