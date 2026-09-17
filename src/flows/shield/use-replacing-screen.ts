import { useCallback, useEffect, useRef, useState } from "react";

export interface ReplacingScreen<E extends HTMLElement> {
  open: boolean;
  show(): void;
  close(): void;
  /// On the control that opens the screen; focus returns to it on close.
  triggerRef: React.RefObject<E>;
}

/// A screen shown in place of the current one that hands focus back when it closes.
export function useReplacingScreen<E extends HTMLElement>(): ReplacingScreen<E> {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<E>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);
  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  return { open, show, close, triggerRef };
}
