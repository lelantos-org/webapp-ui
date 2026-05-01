import { targetChain } from "@/config/chain";
import { useWallet } from "@/features/wallet";
import { shortAddr } from "@/shared/lib/format";

export function ConnectButton() {
  const { status, ethAddress, connect, disconnect, switchChain, error } = useWallet();

  if (status === "disconnected") {
    return (
      <button type="button" className="btn" onClick={connect}>
        connect wallet
      </button>
    );
  }
  if (status === "connecting") return <span className="muted">connecting…</span>;
  if (status === "wrong-chain") {
    return (
      <button type="button" className="btn warn" onClick={switchChain}>
        switch to {targetChain.name} (#{targetChain.id})
      </button>
    );
  }
  if (status === "deriving") {
    return <span className="muted">check your wallet — sign to derive your shielded key</span>;
  }
  if (status === "resuming") {
    return <span className="muted">resuming…</span>;
  }
  if (status === "error") {
    return (
      <span className="err" title={error}>
        error
      </span>
    );
  }
  return (
    <span className="status">
      <span className="mono accent">{shortAddr(ethAddress)}</span>
      <button type="button" className="btn btn--ghost" onClick={disconnect}>
        disconnect
      </button>
    </span>
  );
}
