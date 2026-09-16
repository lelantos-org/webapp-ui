import { useState } from "react";
import { useWalletState } from "@/features/wallet";
import { cx } from "@/shared/lib/cx";
import { WalletDataModal } from "./WalletDataModal";

/// "Manage wallet data" — compact and hard refresh, behind a surface with room
/// to say what each costs.
///
/// Reads `isFetching` itself, where tracking it is the point: both actions are
/// refused while a sync is running.
export function ManageWalletData({ className }: { className?: string }) {
  const [managing, setManaging] = useState(false);
  const { isFetching } = useWalletState();
  return (
    <>
      <button type="button" className={cx("link-btn", className)} onClick={() => setManaging(true)}>
        Manage wallet data
      </button>
      {managing ? (
        <WalletDataModal syncing={isFetching} onClose={() => setManaging(false)} />
      ) : null}
    </>
  );
}
