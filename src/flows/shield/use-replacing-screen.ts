// A screen shown in place of the one it was opened from — Shield's "Choose an
// asset" over the form — that hands focus back when it closes.

import { useCallback, useEffect, useRef, useState } from "react";

export interface ReplacingScreen<E extends HTMLElement> {
  open: boolean;
  show(): void;
  close(): void;
  /// On the control that opens the screen. Focus returns to it on close, so a
  /// keyboard user is not dropped at the top of the page.
  triggerRef: React.RefObject<E>;
}

export function useReplacingScreen<E extends HTMLElement>(): ReplacingScreen<E> {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<E>(null);
  // Only on the way out: focusing the trigger on first mount would steal focus
  // from wherever the page put it.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);
  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  return { open, show, close, triggerRef };
}
