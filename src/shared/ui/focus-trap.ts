// Keyboard containment for modal dialogs.
//
// `aria-modal` marks the rest of the page inert for assistive technology but does
// not stop Tab leaving the dialog, so every modal must contain focus itself.

/// Everything Tab can reach, in DOM order.
///
/// Exported so a dialog's mount-focus pass picks the same first element this
/// wraps to. If the two disagree, focus can start on an element the trap does not
/// treat as first and the initial Shift+Tab leaves the dialog.
export const FOCUSABLE_SELECTOR =
  "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";

/// Cycle Tab and Shift+Tab within `root`. Wire to the dialog's `onKeyDown`.
///
/// Keys off `document.activeElement` being the first or last focusable inside the
/// dialog, so the caller must also focus something inside on mount; otherwise
/// focus sits on `<body>` and nothing is trapped.
export function trapFocus(e: React.KeyboardEvent, root: HTMLElement | null): void {
  if (e.key !== "Tab" || !root) return;
  const focusables = root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}
