import type { WalletStatus } from "@/features/wallet";
import "./claim-cards.css";

export interface ConnectGateProps {
  status: WalletStatus;
  onConnect(): void;
}

const BUTTON_LABEL: Partial<Record<WalletStatus, string>> = {
  connecting: "Connecting…",
  "loading-networks": "Loading networks…",
  deriving: "Waiting for your signature…",
  resuming: "Resuming your session…",
  error: "Try again",
};

/// The claim page's connect prompt, shown before any amount is known.
export function ConnectGate({ status, onConnect }: ConnectGateProps) {
  const waiting =
    status === "connecting" ||
    status === "loading-networks" ||
    status === "deriving" ||
    status === "resuming";
  return (
    <section className="surface surface--card claim-card">
      <div className="claim-card__head">
        <h2 className="claim-card__t">Waiting for you</h2>
        <p className="claim-card__sub claim-card__lead">
          Connect a wallet to derive the shielded address these funds will land in. No funds move to
          connect.
        </p>
      </div>
      {status === "deriving" ? (
        <p className="claim-card__sub" role="status">
          Check your wallet — sign the message to derive your shielded key. It moves no funds.
        </p>
      ) : status === "error" ? (
        <p className="claim-card__sub claim-card__msg" role="status">
          The wallet didn't connect. Try again.
        </p>
      ) : null}
      <div className="claim-cta sticky-cta">
        <button type="button" className="btn btn--cta" onClick={onConnect} disabled={waiting}>
          {BUTTON_LABEL[status] ?? "Connect wallet"}
        </button>
      </div>
    </section>
  );
}
