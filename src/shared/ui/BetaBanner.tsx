/// Standing risk disclosure, pinned above the header on every route.
///
/// Not dismissible: the warning concerns funds at risk, and a dismissed banner
/// stays dismissed for the visit where it matters. One line tall, so leaving it
/// up costs a strip of chrome rather than a portion of the fold.
export function BetaBanner() {
  return (
    <div className="beta-banner" role="note">
      <span className="beta-banner__tag">beta</span>
      <span className="beta-banner__txt">
        <strong>Not production ready.</strong> Lelantos is unaudited software under active
        development. Funds you deposit are at risk of loss — only use amounts you can afford to
        lose.
      </span>
    </div>
  );
}
