// Wallet picker modal.
//
// EIP-6963 announces every installed wallet; this is where the user says which
// one they want to sign with.
//
// A pure function of its props: the ordering and the stored preference behind
// it are selection policy and live in `use-connect-flow`.

import { useCallback } from "react";
import type { Eip6963ProviderDetail } from "@/features/eip1193";
import { MODAL_EXIT_MS } from "@/shared/lib/motion";
import { Modal } from "@/shared/ui/Modal";
import { useExitTransition } from "@/shared/ui/use-exit-transition";

export interface WalletPickerProps {
  /// In display order; the first is focused on mount.
  wallets: Eip6963ProviderDetail[];
  onChoose(rdns: string): void;
  onCancel(): void;
}

export function WalletPicker({ wallets, onChoose, onCancel }: WalletPickerProps) {
  const { exiting, exit } = useExitTransition(MODAL_EXIT_MS);

  const dismiss = useCallback(() => exit(onCancel), [exit, onCancel]);
  // Play the fade before handing off. The wallet's own prompt takes far longer
  // than the fade to appear, so the modal is gone by the time it does; closing
  // the picker only once the extension answered looked like a dropped click.
  const pick = useCallback((rdns: string) => exit(() => onChoose(rdns)), [exit, onChoose]);

  return (
    <Modal title="Choose a wallet" onDismiss={dismiss} exiting={exiting}>
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
      <p className="modal-meta">don't see yours? unlock the extension, then reopen this.</p>
      <div className="modal-actions">
        <button type="button" className="btn btn--ghost" onClick={dismiss}>
          cancel
        </button>
      </div>
    </Modal>
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
