import { type RefObject, useRef } from "react";
import { SupportedNetworks } from "@/features/chain";
import { useWallet } from "../session/context";
import { useWalletChoices } from "./use-connect-flow";
import { WalletCard } from "./WalletCard";
import "./Welcome.css";

/// The first screen before connecting: the pitch, and the wallet card with the picker inline.
export function Welcome() {
  const { status } = useWallet();
  const choices = useWalletChoices();
  const firstRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="welcome">
      <div className="welcome__pitch">
        <span className="welcome__eyebrow">
          <span className="welcome__eyebrow-dot" aria-hidden />
          Zero-knowledge, in your browser
        </span>
        <h1 className="welcome__t">
          Your balance is <br className="only-wide" />
          nobody else's <br className="only-wide" />
          <span className="welcome__t-accent">business.</span>
        </h1>
        <p className="welcome__lead">
          Move assets into a shielded pool, then send, swap and unshield without anyone reading your
          holdings off the chain. Proofs are generated on your device — nothing leaves it.
        </p>
        {status === "disconnected" ? (
          <ConnectCta several={choices.length > 1} firstRef={firstRef} />
        ) : null}
        <SupportedNetworks />
        <ul className="welcome__points">
          <li>
            <strong>
              <span className="welcome__point-mark" aria-hidden>
                👤
              </span>
              No accounts
            </strong>
            <span>Nothing to sign up for</span>
          </li>
          <li>
            <strong>
              <span className="welcome__point-mark" aria-hidden>
                👁️
              </span>
              No tracking
            </strong>
            <span>No cookies, no analytics</span>
          </li>
          <li>
            <strong>
              <span className="welcome__point-mark" aria-hidden>
                ⛽
              </span>
              No gas account
            </strong>
            <span>A relayer pays for spends</span>
          </li>
        </ul>
      </div>
      <WalletCard choices={choices} firstRef={firstRef} />
    </div>
  );
}

function ConnectCta({
  several,
  firstRef,
}: {
  several: boolean;
  firstRef: RefObject<HTMLButtonElement>;
}) {
  const { connect } = useWallet();

  const onClick = () => {
    if (several && firstRef.current) {
      firstRef.current.focus();
      return;
    }
    connect();
  };

  return (
    <div className="welcome__cta">
      <button type="button" className="btn btn--cta welcome__cta-btn" onClick={onClick}>
        Connect wallet
      </button>
      <p className="welcome__hint">
        No funds move. One signature — or a passkey — derives your shielded keys.
      </p>
    </div>
  );
}
