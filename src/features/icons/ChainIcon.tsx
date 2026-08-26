import { cx } from "@/shared/lib/cx";
import { monogramStyle, monogramText } from "./monogram";
import { chainBrand } from "./registry";

export interface ChainIconProps {
  chainId: bigint;
  /// Human label from the registry. Supplies the two letters for a chain the
  /// bundle does not recognise, so a newly onboarded network is identifiable
  /// rather than generic.
  chainName: string;
  className?: string;
}

/// The mark beside a network's name.
///
/// Seeded on the chain id rather than the name: the id is what the deployment
/// keys on elsewhere, while the name is operator-supplied
/// (`chains.public.name` in the relayer's config) and can be reworded without the
/// network changing.
///
/// Decorative, as with `TokenIcon`: every call site prints the chain name beside
/// it.
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
