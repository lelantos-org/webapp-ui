import { describeError } from "@/shared/lib/errors";
import { useWalletState } from "./use-wallet-state";

/// Banner shown inside the action forms when the wallet-state sync failed.
///
/// The forms read `data?.balances ?? []`, so a failed sync is indistinguishable
/// from an empty wallet: every balance reads as zero and the amount validator
/// rejects input as insufficient funds. This states the difference.
///
/// Renders nothing while a sync is succeeding, and nothing on first load, which
/// has its own skeleton; only once a sync has errored.
export function SyncErrorNotice() {
  const { error } = useWalletState();
  if (!error) return null;
  return (
    <div className="err mb-8">
      Balances could not be synced, so amounts below may be incomplete. {describeError(error)}
    </div>
  );
}
