import type { KeyboardEvent } from "react";

/// Tab-reachable elements. Modal's mount focus uses it too, so both agree on the first element.
export const FOCUSABLE_SELECTOR =
  "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";

/// Cycles Tab within `root`, for `onKeyDown`. The caller focuses an element inside on mount.
export function trapFocus(e: KeyboardEvent, root: HTMLElement | null): void {
  if (e.key !== "Tab" || !root) return;
  const focusables = root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (!first || !last) return;
  const active = document.activeElement as HTMLElement | null;
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}
