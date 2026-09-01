import type { WalletStatus } from "@/features/wallet";
import { ConnectButton } from "@/features/wallet";

export interface ConnectGateProps {
  status: WalletStatus;
  onConnect(): void;
}

/// A chain mismatch is not handled here: deriving the destination address needs a
/// signature but no particular network. `ClaimPage` offers the switch separately,
/// since only the sweep signs against the link's chain.
export function ConnectGate({ status, onConnect }: ConnectGateProps) {
  return (
    <div className="card">
      <div className="card__hdr">
        <h2 className="card__t">Connect to claim</h2>
      </div>
      {status === "disconnected" ? (
        <div className="stack stack--sm">
          <p className="muted txt-sm">
            connect a wallet to derive the destination shielded address.
          </p>
          <ConnectButton />
        </div>
      ) : status === "deriving" ? (
        <div className="muted txt-sm">
          check your wallet — sign the EIP-712 message to derive your shielded key (no funds move).
        </div>
      ) : status === "resuming" ? (
        <div className="muted txt-sm">resuming session…</div>
      ) : status === "connecting" ? (
        <div className="muted">connecting…</div>
      ) : (
        <button type="button" className="btn" onClick={onConnect}>
          connect wallet
        </button>
      )}
    </div>
  );
}
