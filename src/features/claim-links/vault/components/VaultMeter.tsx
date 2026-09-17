import { cx } from "@/shared/lib/cx";
import { vaultFillPct } from "../copy";
import type { ClaimLinkPressure } from "../policy";
import "./vault.css";

/// The bar under the vault's count, hidden from assistive technology: the text states the figures.
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
