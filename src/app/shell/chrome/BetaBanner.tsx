import "./BetaBanner.css";

/// Standing risk disclosure, pinned above the header once a wallet is connected
/// (and always on `/claim`); see `Layout`.
///
/// Not dismissible: the warning concerns funds at risk, and a dismissed banner
/// stays dismissed for the visit where it matters. One line tall, so leaving it
/// up costs a strip of chrome rather than a portion of the fold.
///
/// Two sentences, of which CSS shows one: the full one, and at ≤720px a short
/// one that says the same thing in the width a phone has. The hidden copy is `display: none`, so a screen reader
/// hears only the one on screen.
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
