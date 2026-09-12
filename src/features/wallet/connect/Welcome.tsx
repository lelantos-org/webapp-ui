import { type RefObject, useId, useRef } from "react";
import { ChainSwitchButtons, SupportedNetworks } from "@/features/chain";
import { kindAdapter } from "@/features/wallet-kinds";
import { cx } from "@/shared/lib/cx";
import { capitalizeFirst } from "@/shared/lib/text";
import { useWallet } from "../session/use-wallet";
import type { WalletChoice } from "./use-connect-flow";
import { attach, useWalletChoices } from "./use-connect-flow";
import { WalletChoiceList } from "./WalletPicker";
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
            <strong>No accounts</strong>
            <span>Nothing to sign up for</span>
          </li>
          <li>
            <strong>No tracking</strong>
            <span>No cookies, no analytics</span>
          </li>
          <li>
            <strong>No gas account</strong>
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

function WalletCard({
  choices,
  firstRef,
}: {
  choices: WalletChoice[];
  firstRef: RefObject<HTMLButtonElement>;
}) {
  const { status, kind, connect, error } = useWallet();
  const titleId = useId();
  // The panel is one shape for every kind; only the sentences differ, and they
  // travel with the kind rather than being chosen here.
  const deriving = kind ? kindAdapter(kind).copy.deriving : undefined;

  return (
    <section className="surface welcome__card" aria-live="polite" aria-labelledby={titleId}>
      {status === "disconnected" ? (
        <>
          <header className="welcome__card-hdr">
            <h2 className="welcome__card-t" id={titleId}>
              Choose a wallet
            </h2>
            <p className="welcome__card-sub">Used only to derive your shielded key.</p>
          </header>
          {choices.length > 0 ? (
            <WalletChoiceList ref={firstRef} wallets={choices} onChoose={attach} lead />
          ) : (
            // No extension has announced itself and no other kind is usable
            // here. `connect` still waits out the announce window, so the
            // button is worth pressing once an extension is unlocked.
            <button type="button" className="btn btn--outline" onClick={connect}>
              Look for a wallet again
            </button>
          )}
          <p className="footnote">Don't see yours? Unlock the extension, then reopen this.</p>
        </>
      ) : null}

      {status === "unsupported-chain" ? (
        <>
          <CardTitle id={titleId} tone="warn">
            Unsupported network
          </CardTitle>
          <p className="welcome__card-sub">
            Your wallet is on a network this deployment does not serve. Switch it to continue — your
            shielded address is the same on every chain.
          </p>
          <ChainSwitchButtons align="start" />
        </>
      ) : null}

      {status === "connecting" ? (
        <Busy
          id={titleId}
          title="Connecting…"
          body="Approve the connection request in your wallet."
        />
      ) : null}

      {status === "deriving" ? (
        <>
          <Busy
            id={titleId}
            title={capitalizeFirst(deriving?.title ?? "")}
            body={capitalizeFirst(deriving?.body ?? "")}
          />
          {deriving?.warn ? (
            <p className="warn welcome__card-warn">{capitalizeFirst(deriving.warn)}</p>
          ) : null}
          <p className="footnote">{capitalizeFirst(deriving?.note ?? "")}</p>
        </>
      ) : null}

      {status === "resuming" ? (
        <Busy id={titleId} title="Resuming your session…" body="Unlocking your shielded wallet." />
      ) : null}

      {status === "error" ? (
        <>
          <CardTitle id={titleId} tone="err">
            Connection failed
          </CardTitle>
          <p className="welcome__card-sub">{error ?? "Unknown error"}</p>
          <button type="button" className="btn btn--outline" onClick={connect}>
            Try again
          </button>
        </>
      ) : null}
    </section>
  );
}

/// The card's title, in the tone of the state it names.
///
/// A modifier of its own rather than the `.warn` / `.err` utilities. `.warn`
/// sets only a colour, which `.welcome__card-t`'s own colour beats, so the
/// unsupported-network title rendered in the foreground ink; `.err` is the
/// boxed error panel, so "Connection failed" drew a bordered, tinted box around
/// the heading.
function CardTitle({
  id,
  children,
  tone,
}: {
  id: string;
  children: string;
  tone?: "warn" | "err";
}) {
  return (
    <h2 className={cx("welcome__card-t", tone && `welcome__card-t--${tone}`)} id={id}>
      {children}
    </h2>
  );
}

function Busy({ id, title, body }: { id: string; title: string; body: string }) {
  return (
    <div className="welcome__busy">
      <span className="spinner spinner--lg" aria-hidden />
      <div>
        <CardTitle id={id}>{title}</CardTitle>
        <p className="welcome__card-sub">{body}</p>
      </div>
    </div>
  );
}
