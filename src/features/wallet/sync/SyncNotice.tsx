import { userMessage } from "@/shared/lib/errors";
import { hasWasmThreads } from "@/shared/lib/platform";
import { useSyncProgress } from "./sync-progress-store";
import { useWalletState } from "./use-wallet-state";

/// Banners at the top of the spend forms: the wallet's sync state, and a prover that will be slow.
export function SyncNotice() {
  return (
    <>
      <SyncState />
      {hasWasmThreads() ? null : (
        <div className="muted mb-8">
          Proofs will be slow here: this browser limits the page to one thread. Opening the site in
          a regular browser window, outside a wallet app, lifts that.
        </div>
      )}
    </>
  );
}

function SyncState() {
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
