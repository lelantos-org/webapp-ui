import { type RefObject, useRef } from "react";
import { SupportedNetworks } from "@/features/chain";
import { useWallet } from "../session/context";
import { useWalletChoices } from "./use-connect-flow";
import { WalletCard } from "./WalletCard";
import "./Welcome.css";

/// The first screen, before a wallet is connected.
///
/// Two columns: the pitch on the left, and on the right the wallet card that
/// the whole screen is for. The card is the picker itself rather than a button
/// that opens one, so the first thing a new user sees is the choice they are
/// about to make — including the passkey, which needs no extension at all.
///
/// The card also carries every other connection state (approving, deriving,
/// resuming, failed, wrong network), so the pitch stays put while the right
/// column says what is happening.
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

/// "Connect wallet", with the line under it.
///
/// With several wallets on offer the card beside it already is the picker, so
/// the button moves focus to its first row instead of opening a second copy in
/// a modal. With one or none, `connect` goes straight to that wallet — the
/// same shortcut the header's flow takes — and a single-row card would add a
/// click without adding information.
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
