import { useId } from "react";
import { cx } from "@/shared/lib/cx";
import "./ObserverPanel.css";

export interface ObserverPanelProps {
  /// `full` sits below the card; `compact` is the review's section, and the only form on phones.
  variant: "full" | "compact";
  /// Shortened; `undefined` until the field holds a valid address.
  destination: string | undefined;
  /// The gross as published; `undefined` until one is entered.
  amount: string | undefined;
  outro: string | undefined;
}

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
  sep?: boolean;
}) {
  return (
    <div className={cx("observer__row", sep && "observer__row--sep")}>
      <dt className="observer__lbl">{label}</dt>
      <dd className="observer__val mono">{value ?? "—"}</dd>
    </div>
  );
}

/// What an outside observer learns from a withdrawal: two facts in the clear, the rest behind bars.
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
