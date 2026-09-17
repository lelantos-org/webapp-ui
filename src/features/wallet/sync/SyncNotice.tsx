import { userMessage } from "@/shared/lib/errors";
import { useSyncProgress } from "./sync-progress-store";
import { useWalletState } from "./use-wallet-state";

/// Banner in the action forms while balances are not yet synced or the sync failed.
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
