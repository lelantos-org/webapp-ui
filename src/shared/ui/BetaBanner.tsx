/// Standing risk disclosure, pinned above the header on every route.
///
/// Deliberately not dismissible: the warning is about money, and a banner the
/// user can close is a banner they close once and never see again on the visit
/// where it would have mattered. It is one line tall so the cost of leaving it
/// up is a strip of chrome rather than a chunk of the fold.
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
