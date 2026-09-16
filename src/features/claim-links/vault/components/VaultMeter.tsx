import { cx } from "@/shared/lib/cx";
import { vaultFillPct } from "../copy";
import type { ClaimLinkPressure } from "../policy";
import "./vault.css";

/// The bar under the vault's count. The figures are in the text beside it; the
/// bar only draws them, so it is hidden from assistive technology.
export function VaultMeter({
  pressure,
  small = false,
}: {
  pressure: ClaimLinkPressure;
  small?: boolean;
}) {
  return (
    <div className={cx("vault-meter", small && "vault-meter--sm")} aria-hidden="true">
      <span className="vault-meter__fill" style={{ width: `${vaultFillPct(pressure)}%` }} />
    </div>
  );
}
