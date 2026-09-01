import { useId, useState } from "react";
import { useCompactNotes, useHardRefresh } from "@/features/wallet";
import { MODAL_EXIT_MS } from "@/shared/lib/motion";
import { toastError, toastInfo } from "@/shared/lib/toast";
import { Modal } from "@/shared/ui/Modal";
import { useExitTransition } from "@/shared/ui/use-exit-transition";

/// The two local-storage maintenance actions, behind a surface with room to
/// explain them.
///
/// A modal rather than inline micro-copy: hard refresh deletes every note this
/// browser has decrypted and rescans the chain from scratch — minutes of work
/// with no balance on screen — which needs a confirmation that states what is
/// lost and slows the second click down, not a label swap.
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
          ? `pruned ${removed} spent note${removed === 1 ? "" : "s"}`
          : "nothing to prune",
      );
    } catch (e) {
      toastError("compact failed", e);
    } finally {
      setCompacting(false);
    }
  };

  const onHardRefresh = async () => {
    try {
      await hard.run();
      dismiss();
    } catch (e) {
      toastError("hard refresh failed", e);
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
        <strong className="wdm__t">Compact</strong>
        <p className="modal-copy">
          Drops notes that have already been spent from local storage. Balances are unchanged.
        </p>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={syncing || busy}
          onClick={onCompact}
        >
          {compacting ? "compacting…" : "compact"}
        </button>
      </section>

      <section className="wdm__act wdm__act--danger">
        <strong className="wdm__t warn">Hard refresh</strong>
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
          {hard.busy ? "wiping…" : "wipe and resync"}
        </button>
      </section>

      <div className="modal-actions">
        <button type="button" className="btn btn--ghost" onClick={dismiss} disabled={busy}>
          close
        </button>
      </div>
    </Modal>
  );
}
