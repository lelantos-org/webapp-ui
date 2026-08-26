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
import { FOCUSABLE_SELECTOR, trapFocus } from "@/shared/ui/focus-trap";

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !dismissable) return;
      e.stopPropagation();
      onDismiss?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismissable, onDismiss]);

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
