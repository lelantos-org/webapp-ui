import { useId } from "react";
import { cx } from "@/shared/lib/cx";
import "./ObserverPanel.css";

export interface ObserverPanelProps {
  /// `full` sits below the Unshield card; `compact` is the section inside the
  /// review, and the only form phones get.
  variant: "full" | "compact";
  /// The destination as it will appear on-chain, shortened: "0x9E2b…5Aa4".
  /// `undefined` until the field holds a valid address.
  destination: string | undefined;
  /// The gross as published: "500.00 USDC". `undefined` until one is entered.
  amount: string | undefined;
  /// The closing line, from `observerOutro`.
  outro: string | undefined;
}

/// One withheld fact: a label and the bar standing in for its value.
function Redacted({ label, bar }: { label: string; bar: "a" | "b" | "c" }) {
  return (
    <div className="observer__row">
      <dt className="observer__lbl">{label}</dt>
      <dd className="observer__val">
        <span className={cx("observer__redact", `observer__redact--${bar}`)} aria-hidden="true" />
        <span className="sr-only">not visible on-chain</span>
      </dd>
    </div>
  );
}

function Shown({
  label,
  value,
  sep = false,
}: {
  label: string;
  value: string | undefined;
  /// Rule above the row: the line between what is hidden and what is not.
  sep?: boolean;
}) {
  return (
    <div className={cx("observer__row", sep && "observer__row--sep")}>
      <dt className="observer__lbl">{label}</dt>
      <dd className="observer__val mono">{value ?? "—"}</dd>
    </div>
  );
}

/// What an outside observer learns from a withdrawal: two facts in the clear,
/// everything else behind a bar.
///
/// The bars are the one redaction in the app, and they redact from *someone
/// else*: the user's own figures are never hidden from them. Each bar carries a
/// screen-reader phrase, since a bar read as nothing would read as a missing row.
export function ObserverPanel({ variant, destination, amount, outro }: ObserverPanelProps) {
  const titleId = useId();

  if (variant === "compact") {
    return (
      <div className="observer observer--compact">
        <div className="caps observer__cap" id={titleId}>
          What the chain will show
        </div>
        <dl className="inset observer__rows" aria-labelledby={titleId}>
          <Redacted label="Where it came from" bar="a" />
          <Shown label="Destination" value={destination} />
          <Shown label="Amount" value={amount} />
        </dl>
        {outro ? <p className="observer__note">{outro}</p> : null}
      </div>
    );
  }

  return (
    <section className="observer observer--full" aria-labelledby={titleId}>
      <div className="observer__head">
        <h2 className="observer__t" id={titleId}>
          What the chain will show
        </h2>
        <span className="observer__public mono">PUBLIC</span>
      </div>
      <div className="observer__body">
        <p className="observer__p">Everything an outside observer learns from this withdrawal:</p>
        <dl className="inset observer__rows">
          <Redacted label="Where it came from" bar="a" />
          <Redacted label="Your other holdings" bar="b" />
          <Redacted label="Anything you did before" bar="c" />
          <Shown label="Destination" value={destination} sep />
          <Shown label="Amount" value={amount} />
        </dl>
        {outro ? <p className="observer__p">{outro}</p> : null}
      </div>
    </section>
  );
}
