import { monogramStyle, monogramText } from "@/features/icons/monogram";
import { chainBrand } from "@/features/icons/registry";
import { cx } from "@/shared/lib/cx";

export interface ChainIconProps {
  chainId: bigint;
  /// Human label from the registry. Supplies the two letters for a chain the
  /// bundle does not recognise, so a newly onboarded network reads as itself
  /// rather than as a generic dot.
  chainName: string;
  className?: string;
}

/// The mark beside a network's name.
///
/// Seeded on the chain id rather than the name: the id is what the deployment
/// keys on everywhere else, and a name is an operator-supplied string that can
/// be reworded — `chains.public.name` in the relayer's config — without the
/// network having become a different one.
///
/// Decorative, for the same reason as `TokenIcon`: every call site prints the
/// chain name beside it.
export function ChainIcon({ chainId, chainName, className }: ChainIconProps) {
  const brand = chainBrand(chainId);

  return (
    <span
      className={cx("chain-icon", className)}
      style={monogramStyle(chainId.toString(), brand?.color)}
      aria-hidden
    >
      {brand?.label ?? monogramText(chainName)}
    </span>
  );
}
