import { cx } from "@/shared/lib/cx";
import { monogramStyle, monogramText } from "./monogram";
import { tokenBrand } from "./registry";

export interface TokenIconProps {
  /// Display symbol, as the row already shows it — including the `#<id>`
  /// placeholder for an asset whose `symbol()` the indexer has not resolved.
  symbol: string;
  /// ERC-20 address, when the caller has one. Seeds the derived colour for an
  /// unrecognised token so two chains' same-symbol assets stay distinct, and
  /// so a renamed token keeps its mark. Casing is irrelevant — the seed is
  /// lowercased — which matters because the registry hands out checksummed
  /// addresses while the price rows are lowercase.
  address?: string;
  /// `lg` is the 44px claim-page mark; the default is the 24px table mark.
  size?: "sm" | "lg";
  className?: string;
}

/// The mark beside a token's symbol.
///
/// One component for both the portfolio table and the claim page, which drew
/// two different glyphs — a 1-character accent square and a 3-character accent
/// rounded box — for the same idea, and so failed to look like the same wallet.
///
/// Always decorative: `aria-hidden`, with no label of its own. The symbol is
/// rendered as text next to it at every call site, so announcing the mark would
/// make a screen reader read each asset twice. Nothing here is information the
/// adjacent text does not already carry.
export function TokenIcon({ symbol, address, size = "sm", className }: TokenIconProps) {
  const brand = tokenBrand(symbol);
  const box = cx("tok__mark", size === "lg" && "tok__mark--lg", className);

  // A real mark needs no tinted container: the artwork carries its own shape
  // and colour, and a logo set inside an accent square reads as a badge on a
  // badge. The monogram branch keeps the box, because there it *is* the mark.
  if (brand) {
    return (
      <span className={cx(box, "tok__mark--art")} aria-hidden>
        {brand.art}
      </span>
    );
  }

  // The address is the stabler seed, but an asset read out of a balance row
  // may not carry one; the symbol keeps the mark deterministic either way.
  return (
    <span className={box} style={monogramStyle(address ?? symbol)} aria-hidden>
      {monogramText(symbol)}
    </span>
  );
}
