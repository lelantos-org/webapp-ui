import { cx } from "@/shared/lib/cx";
import { monogramStyle, monogramText } from "./monogram";
import { tokenBrand } from "./registry";

export interface TokenIconProps {
  /// Display symbol; may be a `#<id>` placeholder.
  symbol: string;
  /// ERC-20 address, any casing. Seeds the derived colour; `symbol` is the fallback.
  address?: string | undefined;
  /// `sm` is the 24px table mark, `lg` the 44px claim-page mark.
  size?: "sm" | "lg";
  className?: string;
}

/// Decorative token mark: brand artwork, or a derived monogram.
export function TokenIcon({ symbol, address, size = "sm", className }: TokenIconProps) {
  const brand = tokenBrand(symbol);
  const box = cx("tok__mark", size === "lg" && "tok__mark--lg", className);

  if (brand) {
    return (
      <span className={cx(box, "tok__mark--art")} aria-hidden>
        {brand.art}
      </span>
    );
  }

  return (
    <span className={box} style={monogramStyle(address ?? symbol)} aria-hidden>
      {monogramText(symbol)}
    </span>
  );
}
