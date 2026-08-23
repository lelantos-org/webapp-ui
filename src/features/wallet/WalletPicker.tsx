// Wallet picker modal.
//
// EIP-6963 announces every installed wallet; this is where the user says which
// one they want to sign with. Shares the setup modal's shell, so it inherits
// the overlay, the rise-in and the fade-out already tuned there.
//
// A pure function of its props: the ordering and the stored preference behind
// it are selection policy and live in `use-connect-flow`.

import { useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { Eip6963ProviderDetail } from "@/features/eip1193/store";
import { cx } from "@/shared/lib/cx";
import { MODAL_EXIT_MS } from "@/shared/lib/motion";
import { trapFocus } from "@/shared/ui/focus-trap";
import { useExitTransition } from "@/shared/ui/use-exit-transition";

export interface WalletPickerProps {
  /// In display order; the first is focused on mount.
  wallets: Eip6963ProviderDetail[];
  onChoose(rdns: string): void;
  onCancel(): void;
}

export function WalletPicker(props: WalletPickerProps) {
  const target = typeof document !== "undefined" ? document.body : null;
  if (!target) return null;
  return createPortal(<PickerShell {...props} />, target);
}

function PickerShell({ wallets, onChoose, onCancel }: WalletPickerProps) {
  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  const { exiting, exit } = useExitTransition(MODAL_EXIT_MS);

  const dismiss = useCallback(() => exit(onCancel), [exit, onCancel]);
  // Play the fade before handing off. The wallet's own prompt takes far longer
  // than the fade to appear, so the modal is gone by the time it does; closing
  // the picker only once the extension answered looked like a dropped click.
  const pick = useCallback((rdns: string) => exit(() => onChoose(rdns)), [exit, onChoose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  // Focus the first wallet on mount. `trapFocus` keys off `document.activeElement`
  // being the first or last focusable inside the dialog, so without this focus
  // stays on the connect button that just unmounted and Tab walks out.
  useEffect(() => {
    modalRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, []);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click paired with the Escape handler on window for keyboard dismiss
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard equivalent is Escape, handled at window level
    <div
      className={cx("setup-overlay", exiting && "setup-overlay--fade-out")}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        ref={modalRef}
        className={cx("setup-modal", exiting && "setup-modal--fade-out")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => trapFocus(e, modalRef.current)}
      >
        <h2 id={titleId} className="setup-title">
          Choose a wallet
        </h2>
        <ul className="wallet-list">
          {wallets.map((w) => (
            <li key={w.info.uuid}>
              <button type="button" className="wallet-choice" onClick={() => pick(w.info.rdns)}>
                <WalletIcon icon={w.info.icon} name={w.info.name} />
                <span className="wallet-choice__name">{w.info.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="setup-meta">don't see yours? unlock the extension, then reopen this.</p>
        <div className="setup-actions">
          <button type="button" className="btn btn--ghost" onClick={dismiss}>
            cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/// EIP-6963 mandates a data URI, but `info.icon` is a string an untrusted
/// browser extension supplies. Anything else renders as a monogram: the CSP
/// (`img-src 'self' data:`) would block a remote URL anyway, and this way no
/// extension-supplied host is even asked for.
function WalletIcon({ icon, name }: { icon: string; name: string }) {
  if (/^data:image\//i.test(icon)) {
    return <img className="wallet-choice__icon" src={icon} alt="" width={24} height={24} />;
  }
  return (
    <span className="wallet-choice__icon wallet-choice__icon--mono" aria-hidden>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
