import { useState } from "react";
import { useWalletState } from "@/features/wallet";
import { cx } from "@/shared/lib/cx";
import { WalletDataModal } from "./WalletDataModal";

/// "Manage wallet data" button and its modal. The actions are disabled while a sync runs.
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
