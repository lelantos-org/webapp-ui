import { forwardRef, useCallback } from "react";
import { useExitTransition } from "@/shared/hooks/use-exit-transition";
import { cx } from "@/shared/lib/cx";
import { MODAL_EXIT_MS } from "@/shared/lib/motion";
import { ChevronRightGlyph, LockGlyph } from "@/shared/ui/icons/glyphs";
import { Modal } from "@/shared/ui/Modal";
import type { WalletChoice } from "./wallet-offerings";
import "./WalletPicker.css";

/// The picker's copy, shared by the modal and Welcome's inline card.
export const PICKER_COPY = {
  subtitle: "Used only to derive your shielded key.",
  notListed: "Don't see yours? Unlock the extension, then reopen this.",
} as const;

export interface WalletChoiceListProps {
  /// In display order.
  wallets: WalletChoice[];
  onChoose(choice: WalletChoice): void;
  /// Draw the first row as the one to reach for.
  lead?: boolean;
}

/// The wallet rows; `ref` lands on the first button.
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
  const pick = useCallback(
    (choice: WalletChoice) => exit(() => onChoose(choice)),
    [exit, onChoose],
  );

  return (
    <Modal title="Choose a wallet" onDismiss={dismiss} exiting={exiting}>
      <p className="modal-copy">{PICKER_COPY.subtitle}</p>
      <WalletChoiceList wallets={wallets} onChoose={pick} />
      <p className="modal-meta">{PICKER_COPY.notListed}</p>
      <div className="modal-actions">
        <button type="button" className="btn btn--ghost" onClick={dismiss}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

// `info.icon` comes from an untrusted extension: only a data URI renders, anything else is a monogram.
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
