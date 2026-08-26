// A floating element anchored to the trigger that opened it, in viewport
// coordinates.
//
// For a popover that cannot be positioned where it belongs in the DOM. The
// case that needed it: an element inside a panel that animates its own height
// through `overflow: hidden` is clipped to that panel, and no amount of
// `position: absolute` escapes an overflow ancestor. The way out is to portal
// the element to `<body>` and place it against the trigger's rect — which is
// what this measures, and re-measures whenever the rect can have moved.
//
// Deliberately not a general placement engine. It anchors below the trigger,
// flips above where that does not fit, and clamps into the viewport. Anything
// wanting collision-aware placement against arbitrary boundaries wants a
// library, not this.

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
  /// Put on the trigger. Its rect is what the floating element is placed
  /// against, and a pointer press inside it is not a dismissal.
  anchorRef: RefObject<A>;
  /// Put on the floating element, along with `style`.
  floatRef: RefObject<F>;
  /// Opened upwards, because there was more room above than below. Only an
  /// entrance animation cares — it should rise from the side it came from.
  flipped: boolean;
  /// Coordinates once measured; hidden before. The measurement runs in a
  /// layout effect, so the unplaced frame is never painted — this is what
  /// keeps it invisible in a browser that somehow paints one anyway.
  style: CSSProperties;
}

/**
 * @param open whether the floating element is rendered. Placement is dropped
 * when it is not, so the next open measures rather than reusing stale
 * coordinates.
 * @param onDismiss called on a pointer press outside both elements. Read
 * through a ref, so passing a fresh closure every render does not re-subscribe
 * the listeners.
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
    // Downwards unless it does not fit and there is genuinely more room the
    // other way. One that flips for a few pixels is worse than one that
    // scrolls where it is.
    const flipped = height > below && above > below;
    const top = flipped
      ? Math.max(MARGIN, rect.top - GAP - height)
      : Math.min(rect.bottom + GAP, Math.max(MARGIN, vh - MARGIN - height));
    // Left-aligned to the trigger, pulled back in where that would overhang.
    const left = Math.min(Math.max(MARGIN, rect.left), Math.max(MARGIN, vw - MARGIN - width));

    setPlacement({ top, left, flipped });
  }, []);

  // A layout effect, because the size being measured is the rendered element's
  // own: it has to exist before it can be placed, and it has to be placed
  // before the browser paints it.
  useLayoutEffect(() => {
    if (open) reposition();
    else setPlacement(null);
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      // Both are asked, because the floating element is portalled out of the
      // trigger's subtree — one `contains` no longer covers the pair.
      if (anchorRef.current?.contains(target) || floatRef.current?.contains(target)) return;
      dismiss.current();
    };
    // `pointerdown`, not `click`: a press that starts inside the popover and
    // ends outside it is a drag-selection of its text, not a dismissal.
    window.addEventListener("pointerdown", onPointer);
    // Placed against a rect, so it has to be re-placed whenever that rect can
    // have moved. Capturing, because a scroll inside some ancestor's own
    // scroll container never reaches `window` by bubbling.
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
