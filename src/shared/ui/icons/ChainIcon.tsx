import { cx } from "@/shared/lib/cx";
import { monogramStyle, monogramText } from "./monogram";
import { chainBrand } from "./registry";

export interface ChainIconProps {
  chainId: bigint;
  /// Registry label; supplies the monogram letters for an unrecognised chain.
  chainName: string;
  className?: string;
}

/// The decorative mark beside a network's name, seeded on the chain id.
export function ChainIcon({ chainId, chainName, className }: ChainIconProps) {
  const brand = chainBrand(chainId);

  if (brand) {
    return (
      <span className={cx("chain-icon", "chain-icon--art", className)} aria-hidden>
        {brand.art}
      </span>
    );
  }

  return (
    <span
      className={cx("chain-icon", className)}
      style={monogramStyle(chainId.toString())}
      aria-hidden
    >
      {monogramText(chainName)}
    </span>
  );
}
