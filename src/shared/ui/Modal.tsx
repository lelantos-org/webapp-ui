import { type ReactNode, useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "@/shared/hooks/use-escape-key";
import { cx } from "@/shared/lib/cx";
import { FOCUSABLE_SELECTOR, trapFocus } from "./focus-trap";
import "./Modal.css";

export interface ModalProps {
  title: string;
  children: ReactNode;
  /// Called on Escape and backdrop click. Omit to disable both.
  onDismiss?(): void;
  /// Shows the busy cursor and disables dismissal.
  busy?: boolean;
  /// Plays the exit animation and disables dismissal.
  exiting?: boolean;
  /// Id of the element in `children` wired to `aria-describedby`.
  describedBy?: string;
  /// Re-runs the mount focus when it changes, e.g. after the panel content is swapped.
  focusKey?: unknown;
}

/// Open modals. The page scrolls again when the last one closes.
let openModals = 0;

/// Holds the page still behind a modal. `scrollbar-gutter: stable` keeps the layout from shifting.
function lockPageScroll(): () => void {
  const root = document.documentElement;
  if (openModals === 0) root.style.overflow = "hidden";
  openModals += 1;
  return () => {
    openModals -= 1;
    if (openModals === 0) root.style.removeProperty("overflow");
  };
}

/// Modal shell: portal, overlay, dialog panel, Escape dismissal, focus trap and focus return.
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

  useEffect(() => {
    // What had focus when the modal opened gets it back, so the keyboard does not restart from
    // the top of the page.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockPageScroll();
    return () => {
      unlock();
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `focusKey` is the re-run trigger, not a value the effect reads
  useEffect(() => {
    const root = panelRef.current;
    if (!root) return;
    const primary = root.querySelector<HTMLElement>("[data-primary]:not([disabled])");
    (primary ?? root.querySelector<HTMLElement>(FOCUSABLE_SELECTOR))?.focus();
  }, [focusKey]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click; Escape on window is the keyboard equivalent
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape on window is the keyboard equivalent
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
