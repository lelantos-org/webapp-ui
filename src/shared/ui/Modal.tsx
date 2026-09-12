// The shell every modal in the app shares: a portal, the dimmed overlay, the
// dialog panel and its title.
//
// Centralised so the markup and keyboard behaviour — Escape to dismiss, Tab
// trapped inside the panel — are identical across every modal.
//
// Exit timing is not owned here: a caller drives its own, via
// `useExitTransition` or a stage machine that keeps the modal mounted through a
// fade, and reports the result as `exiting`.

import { type ReactNode, useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/shared/lib/cx";
import "./Modal.css";

export interface ModalProps {
  title: string;
  children: ReactNode;
  /// Escape and backdrop clicks call this. Omit for a modal whose only exits are
  /// its own buttons.
  onDismiss?(): void;
  /// A flow is running and must not be interrupted: shows the busy cursor and
  /// closes every dismiss path.
  busy?: boolean;
  /// Plays the exit animation. Also closes the dismiss paths, so a second Escape
  /// cannot queue another close behind the one already playing.
  exiting?: boolean;
  /// Id of the element inside `children` describing the dialog, wired to
  /// `aria-describedby`. A panel that swaps screens should move the id with the
  /// copy, so the announced description matches what is shown.
  describedBy?: string;
  /// Re-runs the mount focus when it changes.
  ///
  /// A modal that swaps its own content — setup moving from intro to running —
  /// unmounts the focused element, and focus falls back to `<body>`. `trapFocus`
  /// keys off `document.activeElement` being inside the panel, so it would then
  /// trap nothing.
  focusKey?: unknown;
}

export function Modal(props: ModalProps) {
  const target = typeof document !== "undefined" ? document.body : null;
  if (!target) return null;
  return createPortal(<ModalShell {...props} />, target);
}

function ModalShell({
  title,
  children,
  onDismiss,
  busy = false,
  exiting = false,
  describedBy,
  focusKey,
}: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const dismissable = !!onDismiss && !busy && !exiting;

  const dismiss = useCallback(() => {
    if (dismissable) onDismiss?.();
  }, [dismissable, onDismiss]);

  useEscapeKey(dismissable ? onDismiss : undefined);

  // `[data-primary]` is the caller's nomination for the likely keyboard action.
  // `:not([disabled])` because a screen may render it behind a confirmation the
  // user has not yet given, and focusing a disabled button leaves focus on
  // `<body>`.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `focusKey` is the re-run trigger, not a value the effect reads
  useEffect(() => {
    const root = panelRef.current;
    if (!root) return;
    const primary = root.querySelector<HTMLElement>("[data-primary]:not([disabled])");
    (primary ?? root.querySelector<HTMLElement>(FOCUSABLE_SELECTOR))?.focus();
  }, [focusKey]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click paired with the Escape handler on window for keyboard dismiss
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard equivalent is Escape, handled at window level
    <div
      className={cx(
        "modal-overlay",
        busy && "modal-overlay--locked",
        exiting && "modal-overlay--fade-out",
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        ref={panelRef}
        className={cx("modal-panel", exiting && "modal-panel--fade-out")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        onKeyDown={(e) => trapFocus(e, panelRef.current)}
      >
        <h2 id={titleId} className="modal-title">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

/// Keyboard containment for modal dialogs.
///
/// `aria-modal` marks the rest of the page inert for assistive technology but does
/// not stop Tab leaving the dialog, so every modal must contain focus itself.
///
/// Everything Tab can reach, in DOM order.
///
/// Shared with the dialog's mount-focus pass, so it picks the same first element
/// this wraps to. If the two disagree, focus can start on an element the trap does not
/// treat as first and the initial Shift+Tab leaves the dialog.
const FOCUSABLE_SELECTOR =
  "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";

/// Cycle Tab and Shift+Tab within `root`. Wire to the dialog's `onKeyDown`.
///
/// Keys off `document.activeElement` being the first or last focusable inside the
/// dialog, so the caller must also focus something inside on mount; otherwise
/// focus sits on `<body>` and nothing is trapped.
function trapFocus(e: React.KeyboardEvent, root: HTMLElement | null): void {
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

/// Run `onEscape` when Escape is pressed anywhere on the page, while it is set.
/// Stops the event there, so a surface under this one does not also close.
export function useEscapeKey(onEscape: (() => void) | undefined): void {
  useEffect(() => {
    if (!onEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEscape]);
}
