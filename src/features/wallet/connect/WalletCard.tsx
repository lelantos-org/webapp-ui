import { type RefObject, useId } from "react";
import { ChainSwitchButtons } from "@/features/chain";
import { kindAdapter, selectKind } from "@/features/wallet-kinds";
import { cx } from "@/shared/lib/cx";
import { capitalizeFirst } from "@/shared/lib/format/text";
import { useWallet } from "../session/context";
import { PICKER_COPY, WalletChoiceList } from "./WalletPicker";
import type { WalletChoice } from "./wallet-offerings";
import "./Welcome.css";

/// Welcome's right column: the wallet picker while disconnected, and every other
/// connection state in its place.
export function WalletCard({
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
            <p className="welcome__card-sub">{PICKER_COPY.subtitle}</p>
          </header>
          {choices.length > 0 ? (
            // `selectKind` detaches the kinds it is not choosing; see the
            // invariant on `features/wallet-kinds`.
            <WalletChoiceList
              ref={firstRef}
              wallets={choices}
              onChoose={(choice) => selectKind(choice.kind, choice.id)}
              lead
            />
          ) : (
            // No extension has announced itself and no other kind is usable
            // here. `connect` still waits out the announce window, so the
            // button is worth pressing once an extension is unlocked.
            <button type="button" className="btn btn--outline" onClick={connect}>
              Look for a wallet again
            </button>
          )}
          <p className="footnote">{PICKER_COPY.notListed}</p>
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
