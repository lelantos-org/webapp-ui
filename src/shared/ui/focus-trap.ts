// Keyboard containment for modal dialogs.
//
// `aria-modal` tells assistive tech the rest of the page is inert; it does not
// stop Tab from walking out of the dialog into the page behind it. Every modal
// has to do that itself, so it lives here rather than in whichever one needed
// it first.

/// Cycle Tab and Shift+Tab within `root`. Wire to the dialog's `onKeyDown`.
///
/// Keys off `document.activeElement` being the first or last focusable inside
/// the dialog, so the caller must also focus something inside on mount —
/// otherwise focus sits on `<body>` and this traps nothing.
export function trapFocus(e: React.KeyboardEvent, root: HTMLElement | null): void {
  if (e.key !== "Tab" || !root) return;
  const focusables = root.querySelectorAll<HTMLElement>(
    "button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
  );
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
