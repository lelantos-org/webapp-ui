import { useEffect, useState } from "react";
import { useWalletState } from "@/features/wallet";
import { relativeTime } from "@/shared/lib/format";
import { WalletDataModal } from "./WalletDataModal";

/// Header for the Portfolio card: sync status and the refresh action.
///
/// `hard refresh` and `compact` sit behind `manage`, in a modal with room to
/// say what each costs; as equal-weight links here they would put a
/// several-minute wipe-and-rescan at the same visual weight as a refetch.
/// `refresh` stays inline, being read constantly and cheap.
export function PortfolioActions() {
  const shielded = useWalletState();
  const [managing, setManaging] = useState(false);

  const syncing = shielded.isFetching;
  const syncedAt = shielded.data?.syncedAt;

  return (
    <span className="muted txt-xs">
      {syncing ? "syncing…" : syncedAt ? <SyncedAgo at={syncedAt} /> : "not synced"}
      <Sep />
      <InlineAction disabled={syncing} onClick={() => shielded.refetch()} label="refresh" />
      <Sep />
      <InlineAction onClick={() => setManaging(true)} label="manage" />
      {managing ? <WalletDataModal syncing={syncing} onClose={() => setManaging(false)} /> : null}
    </span>
  );
}

/// Renders the relative sync time. Owns its own tick, so the 10s refresh
/// re-renders this span alone rather than the balance table above it.
///
/// Mounted only while there is a `syncedAt` and no sync in flight, so the timer
/// stops as soon as either changes.
function SyncedAgo({ at }: { at: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);
  return <>synced {relativeTime(at)}</>;
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
