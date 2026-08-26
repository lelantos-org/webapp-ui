import { cx } from "@/shared/lib/cx";
import { monogramStyle, monogramText } from "./monogram";
import { tokenBrand } from "./registry";

export interface TokenIconProps {
  /// Display symbol, as the row already shows it — including the `#<id>`
  /// placeholder for an asset whose `symbol()` the indexer has not resolved.
  symbol: string;
  /// ERC-20 address, when the caller has one. Seeds the derived colour for an
  /// unrecognised token, keeping two chains' same-symbol assets distinct and a
  /// renamed token's mark stable. Casing does not matter: the seed is lowercased,
  /// which reconciles the registry's checksummed addresses with the lowercase
  /// price rows.
  address?: string;
  /// `lg` is the 44px claim-page mark; the default is the 24px table mark.
  size?: "sm" | "lg";
  className?: string;
}

/// The mark beside a token's symbol.
///
/// One component for both the portfolio table and the claim page, so a token's
/// mark is identical in each.
///
/// Always decorative: `aria-hidden`, with no label of its own. Every call site
/// renders the symbol as text beside it, so announcing the mark would make a
/// screen reader read each asset twice.
export function TokenIcon({ symbol, address, size = "sm", className }: TokenIconProps) {
  const brand = tokenBrand(symbol);
  const box = cx("tok__mark", size === "lg" && "tok__mark--lg", className);

  // Artwork needs no tinted container: it carries its own shape and colour, and a
  // logo inside an accent square reads as a badge on a badge. The monogram branch
  // keeps the box, where the box is the mark.
  if (brand) {
    return (
      <span className={cx(box, "tok__mark--art")} aria-hidden>
        {brand.art}
      </span>
    );
  }

  // The address is the more stable seed, but an asset read from a balance row may
  // not carry one; the symbol keeps the mark deterministic either way.
  return (
    <span className={box} style={monogramStyle(address ?? symbol)} aria-hidden>
      {monogramText(symbol)}
    </span>
  );
}
