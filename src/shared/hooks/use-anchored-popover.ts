import {
  type CSSProperties,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const GAP = 6;
const MARGIN = 8;

interface Placement {
  top: number;
  left: number;
  flipped: boolean;
}

/// A floating element portalled to `<body>` and placed against its trigger's rect.
export interface AnchoredPopover<A extends HTMLElement, F extends HTMLElement> {
  /// Put on the trigger; a press inside it is not a dismissal.
  anchorRef: RefObject<A>;
  /// Put on the floating element, along with `style`.
  floatRef: RefObject<F>;
  /// Opened upwards; an entrance animation should rise from the anchored side.
  flipped: boolean;
  style: CSSProperties;
}

/// Places a popover below (or above) its trigger while `open`; `onDismiss` fires on an outside press.
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
    const flipped = height > below && above > below;
    const top = flipped
      ? Math.max(MARGIN, rect.top - GAP - height)
      : Math.min(rect.bottom + GAP, Math.max(MARGIN, vh - MARGIN - height));
    const left = Math.min(Math.max(MARGIN, rect.left), Math.max(MARGIN, vw - MARGIN - width));

    setPlacement({ top, left, flipped });
  }, []);

  useLayoutEffect(() => {
    if (open) reposition();
    else setPlacement(null);
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || floatRef.current?.contains(target)) return;
      dismiss.current();
    };
    window.addEventListener("pointerdown", onPointer);
    // Capturing: a scroll inside an ancestor's own container never bubbles to `window`.
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
