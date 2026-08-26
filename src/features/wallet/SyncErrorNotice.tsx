import { describeError } from "@/shared/lib/errors";
import { useWalletState } from "./use-wallet-state";

/// Banner shown inside the action forms when the wallet-state sync failed.
///
/// The forms read `data?.balances ?? []`, so a failed sync is indistinguishable
/// from an empty wallet: every balance reads as zero and the amount validator
/// rejects any input as insufficient funds. Rendered as "you have no funds"
/// that is a wrong and alarming thing to tell someone whose funds are fine and
/// whose FMD server is merely unreachable.
///
/// Renders nothing while a sync is succeeding, and nothing on the first load
/// (there is a skeleton for that) — only once a sync has actually errored.
export function SyncErrorNotice() {
  const { error } = useWalletState();
  if (!error) return null;
  return (
    <div className="err mb-3">
      Balances could not be synced, so amounts below may be incomplete. {describeError(error)}
    </div>
  );
}
