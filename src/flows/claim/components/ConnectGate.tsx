import type { WalletStatus } from "@/features/wallet";
import "./claim-cards.css";

export interface ConnectGateProps {
  status: WalletStatus;
  onConnect(): void;
}

/// The button's word while a connection is under way or has failed.
const BUTTON_LABEL: Partial<Record<WalletStatus, string>> = {
  connecting: "Connecting…",
  deriving: "Waiting for your signature…",
  resuming: "Resuming your session…",
  error: "Try again",
};

/// The claim page's connect state, without the amount.
///
/// The amount waiting is not shown before a wallet connects: the scan needs a
/// session layer that only exists once one does (`use-claim-flow.ts`), so the
/// card says what connecting is for and leaves the figure to the next step.
///
/// A chain mismatch is not handled here: deriving the destination address needs a
/// signature but no particular network. `ClaimPage` offers the switch separately,
/// since only the sweep signs against the link's chain.
export function ConnectGate({ status, onConnect }: ConnectGateProps) {
  const waiting = status === "connecting" || status === "deriving" || status === "resuming";
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
