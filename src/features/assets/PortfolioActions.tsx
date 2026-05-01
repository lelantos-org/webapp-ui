import { useState } from "react";
import {
  useCompactNotes,
  useHardRefresh,
  useWalletState,
} from "@/features/wallet/use-wallet-state";
import { relativeTime } from "@/shared/lib/format";
import { toastError, toastInfo } from "@/shared/lib/toast";

/// Header for the Portfolio card: sync status + refresh / hard refresh / compact actions.
export function PortfolioActions() {
  const shielded = useWalletState();
  const hard = useHardRefresh();
  const compact = useCompactNotes();
  const [confirmHard, setConfirmHard] = useState(false);
  const [compacting, setCompacting] = useState(false);

  const syncing = shielded.isFetching;
  const syncedAt = shielded.data?.syncedAt;

  const onCompact = async () => {
    setCompacting(true);
    try {
      const removed = await compact.run();
      toastInfo(
        removed > 0 ? `pruned ${removed} spent note${removed === 1 ? "" : "s"}` : "nothing to prune",
      );
    } catch (e) {
      toastError("compact failed", e);
    } finally {
      setCompacting(false);
    }
  };

  return (
    <span className="muted txt-xs">
      {syncing ? "syncing…" : syncedAt ? `synced ${relativeTime(syncedAt)}` : "not synced"}
      <Sep />
      <InlineAction disabled={syncing} onClick={() => shielded.refetch()} label="refresh" />
      <Sep />
      {confirmHard ? (
        <>
          <InlineAction
            disabled={syncing}
            onClick={async () => {
              setConfirmHard(false);
              await hard.run();
            }}
            label="wipe + resync?"
            tone="warn"
          />{" "}
          <InlineAction onClick={() => setConfirmHard(false)} label="cancel" />
        </>
      ) : (
        <InlineAction
          disabled={syncing}
          onClick={() => setConfirmHard(true)}
          label="hard refresh"
        />
      )}
      <Sep />
      <InlineAction
        disabled={syncing || compacting}
        onClick={onCompact}
        label={compacting ? "compacting…" : "compact"}
      />
    </span>
  );
}

function Sep() {
  return <> · </>;
}

interface InlineActionProps {
  label: string;
  onClick(): void;
  disabled?: boolean;
  tone?: "warn";
}

function InlineAction({ label, onClick, disabled, tone }: InlineActionProps) {
  return (
    <button
      type="button"
      className={`lnk lnk--inline${tone === "warn" ? " warn" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
