import { type ReactNode, useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "@/shared/hooks/use-escape-key";
import { cx } from "@/shared/lib/cx";
import { FOCUSABLE_SELECTOR, trapFocus } from "./focus-trap";
import "./Modal.css";

export interface ModalProps {
  title: string;
  children: ReactNode;
  /// Called on Escape and backdrop click. Omit when only the modal's own buttons exit.
  onDismiss?(): void;
  /// A flow is running: busy cursor, and every dismiss path closed.
  busy?: boolean;
  /// Plays the exit animation and closes the dismiss paths.
  exiting?: boolean;
  /// Id of the element in `children` wired to `aria-describedby`.
  describedBy?: string;
  /// Re-runs the mount focus when it changes, e.g. after the panel swaps its content.
  focusKey?: unknown;
}

/// The shared modal shell: portal, overlay, dialog panel, Escape and focus trap.
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
