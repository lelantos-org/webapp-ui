// Wallet picker: the list of wallets, and the modal that shows it.
//
// EIP-6963 announces every installed extension, and a passkey is offered
// alongside them; this is where the user says which one holds their key.
//
// Both are pure functions of their props; the ordering, the stored preference
// and whether a passkey row appears at all are selection policy and live in
// `use-connect-flow`. The list is shared: the modal opens it from the header,
// and the Welcome screen draws the same rows inline in its wallet card, so the
// two can never offer different wallets or name them differently.

import { forwardRef, useCallback } from "react";
import { cx } from "@/shared/lib/cx";
import { MODAL_EXIT_MS } from "@/shared/lib/motion";
import { ChevronRightGlyph, LockGlyph } from "@/shared/ui/glyphs";
import { Modal } from "@/shared/ui/Modal";
import { useExitTransition } from "@/shared/ui/use-exit-transition";
import type { WalletChoice } from "./use-connect-flow";
import "./WalletPicker.css";

export interface WalletChoiceListProps {
  /// In display order.
  wallets: WalletChoice[];
  onChoose(choice: WalletChoice): void;
  /// Draw the first row as the one to reach for. The order already puts the
  /// passkey or the remembered extension first (see `offerings`), so the lead row
  /// restates that choice rather than making a new one.
  lead?: boolean;
}

/// The rows. `ref` lands on the first button, so a caller can move focus there —
/// Welcome's "Connect wallet" does, rather than opening a second copy of the list.
export const WalletChoiceList = forwardRef<HTMLButtonElement, WalletChoiceListProps>(
  function WalletChoiceList({ wallets, onChoose, lead = false }, firstRef) {
    return (
      <ul className="wallet-list">
        {wallets.map((w, i) => (
          <li key={`${w.kind}:${w.id}`}>
            <button
              type="button"
              ref={i === 0 ? firstRef : undefined}
              className={cx("wallet-choice", lead && i === 0 && "wallet-choice--lead")}
              onClick={() => onChoose(w)}
            >
              <WalletIcon choice={w} />
              <span className="wallet-choice__text">
                <span className="wallet-choice__name">{w.name}</span>
                {w.kind === "passkey" ? (
                  <span className="wallet-choice__hint">No browser wallet needed</span>
                ) : null}
              </span>
              <ChevronRightGlyph size={16} className="wallet-choice__chev" />
            </button>
          </li>
        ))}
      </ul>
    );
  },
);

export interface WalletPickerProps {
  /// In display order; the first is focused on mount.
  wallets: WalletChoice[];
  onChoose(choice: WalletChoice): void;
  onCancel(): void;
}

export function WalletPicker({ wallets, onChoose, onCancel }: WalletPickerProps) {
  const { exiting, exit } = useExitTransition(MODAL_EXIT_MS);

  const dismiss = useCallback(() => exit(onCancel), [exit, onCancel]);
  // Play the fade before handing off. The wallet's own prompt takes longer than
  // the fade to appear, so the modal is gone by the time it does; waiting for the
  // extension to answer would read as a dropped click.
  const pick = useCallback(
    (choice: WalletChoice) => exit(() => onChoose(choice)),
    [exit, onChoose],
  );

  return (
    <Modal title="Choose a wallet" onDismiss={dismiss} exiting={exiting}>
      <p className="modal-copy">Used only to derive your shielded key.</p>
      <WalletChoiceList wallets={wallets} onChoose={pick} />
      <p className="modal-meta">Don't see yours? Unlock the extension, then reopen this.</p>
      <div className="modal-actions">
        <button type="button" className="btn btn--ghost" onClick={dismiss}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

/// EIP-6963 mandates a data URI, but `info.icon` is a string supplied by an
/// untrusted browser extension. Anything else renders as a monogram: the CSP
/// (`img-src 'self' data:`) would block a remote URL, and no extension-supplied
/// host is contacted.
///
/// The passkey row never reaches that path — its glyph is inline and ships with
/// the bundle, so there is no untrusted string to guard.
function WalletIcon({ choice }: { choice: WalletChoice }) {
  if (choice.kind === "passkey") {
    return (
      <span className="wallet-choice__icon wallet-choice__icon--glyph" aria-hidden>
        <LockGlyph size={16} />
      </span>
    );
  }
  if (choice.icon && /^data:image\//i.test(choice.icon)) {
    return <img className="wallet-choice__icon" src={choice.icon} alt="" width={30} height={30} />;
  }
  return (
    <span className="wallet-choice__icon wallet-choice__icon--mono" aria-hidden>
      {choice.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
