import { userMessage } from "@/shared/lib/errors";
import { useSyncProgress } from "./sync-progress-store";
import { useWalletState } from "./use-wallet-state";

/// Banner shown inside the action forms while the wallet's balances cannot be
/// trusted — because the first sync has not finished, or because one failed.
///
/// The forms read `data?.balances ?? []`, so an unfinished sync and an empty
/// wallet are the same thing on screen: every balance reads as zero and the
/// amount validator rejects input as insufficient funds. This states the
/// difference for a slow sync too, not only a failed one — a slow sync is what
/// every new arrival hits, since a cold sync pages the whole note feed and can
/// run for minutes.
///
/// Three states, in the order they matter:
///   - errored     — the figures are stale and may never arrive
///   - first sync  — there are no figures yet, and a moving count says so
///   - settled     — nothing to say
export function SyncNotice() {
  const { error, isPending } = useWalletState();
  const progress = useSyncProgress();

  if (error) {
    return (
      <div className="err">
        Balances could not be synced, so amounts below may be incomplete. {userMessage(error)}
      </div>
    );
  }

  // `isPending` is the no-data-yet case specifically. A refetch over figures
  // already on screen must stay silent: those amounts are usable, and a banner
  // over them would be noise on every new block.
  if (!isPending) return null;

  return (
    <div className="muted mb-8" aria-live="polite">
      Still adding up your balance — amounts below are not final yet.
      {progress.active && progress.scanned > 0 ? (
        <>
          {" "}
          <span className="mono">
            {progress.scanned.toLocaleString()} scanned, {progress.hits.toLocaleString()} found
          </span>
        </>
      ) : null}
    </div>
  );
}
