import { useId, useState } from "react";
import { useCompactNotes, useHardRefresh } from "@/features/wallet";
import { useExitTransition } from "@/shared/hooks/use-exit-transition";
import { MODAL_EXIT_MS } from "@/shared/lib/motion";
import { toastError, toastInfo } from "@/shared/lib/toast";
import { Modal } from "@/shared/ui/Modal";
import "./WalletDataModal.css";

/// Modal for the two local wallet-data actions: clear spent notes, and a confirmed wipe and resync.
export function WalletDataModal({ onClose, syncing }: { onClose(): void; syncing: boolean }) {
  const hard = useHardRefresh();
  const compact = useCompactNotes();
  const { exiting, exit } = useExitTransition(MODAL_EXIT_MS);
  const descId = useId();
  const [compacting, setCompacting] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const dismiss = () => exit(onClose);
  const busy = compacting || hard.busy;

  const onCompact = async () => {
    setCompacting(true);
    try {
      const removed = await compact.run();
      toastInfo(
        removed > 0
          ? `Cleared ${removed} spent note${removed === 1 ? "" : "s"}`
          : "No spent notes to clear",
      );
    } catch (e) {
      toastError("Couldn't clear spent notes", e);
    } finally {
      setCompacting(false);
    }
  };

  const onHardRefresh = async () => {
    try {
      await hard.run();
      dismiss();
    } catch (e) {
      toastError("Wipe and resync failed", e);
    }
  };

  return (
    <Modal
      title="Wallet data"
      onDismiss={dismiss}
      busy={busy}
      exiting={exiting}
      describedBy={descId}
    >
      <p className="modal-copy" id={descId}>
        Everything below acts on what this browser has stored. Your funds live on the network and
        are not affected.
      </p>

      <section className="wdm__act">
        <strong className="wdm__t">Clear spent notes</strong>
        <p className="modal-copy">
          Removes notes you have already spent from this browser's storage, so a sync has less to
          read. It does not merge notes, change your balance or change what Max allows — sending
          merges the notes it touches.
        </p>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={syncing || busy}
          onClick={onCompact}
        >
          {compacting ? "Clearing…" : "Clear spent notes"}
        </button>
      </section>

      <section className="wdm__act wdm__act--danger">
        <strong className="wdm__t">Wipe and resync</strong>
        <p className="modal-copy">
          Deletes every note this browser has decrypted and rescans the chain from the beginning. On
          a busy chain this takes several minutes, and the wallet shows no balance until it
          finishes.
        </p>
        <label className="wdm__ack">
          <input
            type="checkbox"
            checked={acknowledged}
            disabled={syncing || busy}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          <span>I understand this rescans from scratch</span>
        </label>
        <button
          type="button"
          className="btn btn--danger"
          disabled={syncing || busy || !acknowledged}
          onClick={onHardRefresh}
        >
          {hard.busy ? "Wiping…" : "Wipe and resync"}
        </button>
      </section>

      <div className="modal-actions">
        <button type="button" className="btn btn--ghost" onClick={dismiss} disabled={busy}>
          Close
        </button>
      </div>
    </Modal>
  );
}
