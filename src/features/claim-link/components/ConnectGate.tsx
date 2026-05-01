import { targetChain } from "@/config/chain";
import { ConnectButton } from "@/features/wallet/ConnectButton";
import type { WalletStatus } from "@/features/wallet/types";

export interface ConnectGateProps {
  status: WalletStatus;
  chainOk: boolean;
  onConnect(): void;
  onSwitchChain(): void;
}

export function ConnectGate({ status, chainOk, onConnect, onSwitchChain }: ConnectGateProps) {
  return (
    <div className="card">
      <div className="card__hdr">
        <h3 className="card__t">connect to claim</h3>
      </div>
      {status === "disconnected" ? (
        <div className="stack stack--sm">
          <p className="muted txt-sm">
            connect a wallet to derive the destination shielded address.
          </p>
          <ConnectButton />
        </div>
      ) : status === "wrong-chain" ? (
        <div className="stack stack--sm">
          <p className="muted txt-sm">
            switch to {targetChain.name} (chain id {targetChain.id}).
          </p>
          <button type="button" className="btn warn" onClick={onSwitchChain} disabled={chainOk}>
            switch to {targetChain.name}
          </button>
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
