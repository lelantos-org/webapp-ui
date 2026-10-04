import { Link } from "react-router-dom";
import { useBalances } from "@/features/assets";
import { SyncNotice, useWallet } from "@/features/wallet";

/// The banners at the top of a form that spends shielded funds.
export function SpendNotices() {
  return (
    <>
      <SyncNotice />
      <NothingShielded />
    </>
  );
}

/// For a wallet that holds nothing: where the funds would come from.
function NothingShielded() {
  const { data } = useBalances();
  const { capabilities } = useWallet();
  if (!data || data.balances.some((b) => b.balance > 0n || b.pending > 0n)) return null;

  return (
    <div className="muted mb-8">
      Nothing shielded yet.{" "}
      {capabilities.deposit.allowed ? (
        <>
          <Link to="/shield">Shield an asset</Link> to have something to send.
        </>
      ) : (
        "Have someone send to your shielded address, or claim a link sent to you."
      )}
    </div>
  );
}
