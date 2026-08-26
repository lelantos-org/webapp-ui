// A floating element anchored to the trigger that opened it, in viewport
// coordinates.
//
// For a popover that cannot be positioned where it belongs in the DOM: an
// element inside a panel animating its height through `overflow: hidden` is
// clipped to that panel, and `position: absolute` does not escape an overflow
// ancestor. The element is portalled to `<body>` and placed against the
// trigger's rect, re-measured whenever that rect can have moved.
//
// Not a general placement engine. It anchors below the trigger, flips above
// where that does not fit, and clamps into the viewport; collision-aware
// placement against arbitrary boundaries needs a library.

import {
  type CSSProperties,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/// Gap between the trigger and the floating element, and the least that
/// element may come to the edge of the viewport. Both px.
const GAP = 6;
const MARGIN = 8;

interface Placement {
  top: number;
  left: number;
  flipped: boolean;
}

export interface AnchoredPopover<A extends HTMLElement, F extends HTMLElement> {
  /// Put on the trigger. Its rect is what the floating element is placed against,
  /// and a pointer press inside it is not a dismissal.
  anchorRef: RefObject<A>;
  /// Put on the floating element, along with `style`.
  floatRef: RefObject<F>;
  /// Opened upwards, because there was more room above than below. Relevant only
  /// to an entrance animation, which should rise from the anchored side.
  flipped: boolean;
  /// Coordinates once measured, hidden before. The measurement runs in a layout
  /// effect so the unplaced frame is not painted; the hidden style covers a
  /// browser that paints one regardless.
  style: CSSProperties;
}

/**
 * @param open whether the floating element is rendered. Placement is dropped
 * when it is not, so the next open measures rather than reusing stale
 * coordinates.
 * @param onDismiss called on a pointer press outside both elements. Read through
 * a ref, so a fresh closure each render does not re-subscribe the listeners.
 */
export function useAnchoredPopover<A extends HTMLElement, F extends HTMLElement>(
  open: boolean,
  onDismiss: () => void,
): AnchoredPopover<A, F> {
  const anchorRef = useRef<A>(null);
  const floatRef = useRef<F>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const float = floatRef.current;
    if (!anchor || !float) return;

    const rect = anchor.getBoundingClientRect();
    const { clientWidth: vw, clientHeight: vh } = document.documentElement;
    const { offsetHeight: height, offsetWidth: width } = float;

    const below = vh - rect.bottom - GAP - MARGIN;
    const above = rect.top - GAP - MARGIN;
    // Downwards unless it does not fit and there is more room above, so a few
    // pixels of overflow do not trigger a flip.
    const flipped = height > below && above > below;
    const top = flipped
      ? Math.max(MARGIN, rect.top - GAP - height)
      : Math.min(rect.bottom + GAP, Math.max(MARGIN, vh - MARGIN - height));
    // Left-aligned to the trigger, pulled back in where that would overhang.
    const left = Math.min(Math.max(MARGIN, rect.left), Math.max(MARGIN, vw - MARGIN - width));

    setPlacement({ top, left, flipped });
  }, []);

  // A layout effect, because the size measured is the rendered element's own: it
  // must exist before it can be placed, and be placed before the browser paints.
  useLayoutEffect(() => {
    if (open) reposition();
    else setPlacement(null);
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      // Both are checked, since the floating element is portalled out of the
      // trigger's subtree and one `contains` does not cover the pair.
      if (anchorRef.current?.contains(target) || floatRef.current?.contains(target)) return;
      dismiss.current();
    };
    // `pointerdown` rather than `click`: a press starting inside the popover and
    // ending outside is a drag-selection of its text, not a dismissal.
    window.addEventListener("pointerdown", onPointer);
    // Placed against a rect, so it is re-placed whenever that rect can have
    // moved. Capturing, because a scroll inside an ancestor's own scroll
    // container never reaches `window` by bubbling.
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  return {
    anchorRef,
    floatRef,
    flipped: placement?.flipped ?? false,
    style: placement ? { top: placement.top, left: placement.left } : { visibility: "hidden" },
  };
}
