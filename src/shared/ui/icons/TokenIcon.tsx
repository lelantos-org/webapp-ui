import { cx } from "@/shared/lib/cx";
import { monogramStyle, monogramText } from "./monogram";
import { tokenBrand } from "./registry";

export interface TokenIconProps {
  /// Display symbol, including the `#<id>` placeholder.
  symbol: string;
  /// ERC-20 address, the preferred seed for a derived colour. Any casing.
  address?: string | undefined;
  /// `lg` is the 44px claim-page mark; the default is the 24px table mark.
  size?: "sm" | "lg";
  className?: string;
}

/// The decorative mark beside a token's symbol: brand artwork, or a derived monogram.
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
