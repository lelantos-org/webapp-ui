import "./BetaBanner.css";

/// Non-dismissible funds-at-risk disclosure; CSS shows the short copy on narrow screens.
export function BetaBanner() {
  return (
    <div className="beta-banner" role="note">
      <span className="beta-banner__tag">beta</span>
      <span className="beta-banner__txt beta-banner__txt--full">
        <strong>Not production ready.</strong> Unaudited software under active development — only
        put in what you can afford to lose.
      </span>
      <span className="beta-banner__txt beta-banner__txt--short">
        Unaudited. Only put in what you can afford to lose.
      </span>
    </div>
  );
}
