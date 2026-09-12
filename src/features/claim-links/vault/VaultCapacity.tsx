import { useId, useState } from "react";
import { cx } from "@/shared/lib/cx";
import { plural } from "@/shared/lib/text";
import { toast } from "@/shared/lib/toast";
import { WarnGlyph } from "@/shared/ui/glyphs";
import { downloadClaimLinks } from "../link-vault/export";
import type { ClaimLinkPressure } from "../link-vault/policy";
import type { StoredClaimLink } from "../link-vault/record";
import { forgetClaimLinks } from "../link-vault/store";
import { capacityBody, capacityHeadline, vaultFillPct, vaultTone } from "../vault-copy";
import "./vault.css";

export interface VaultCapacityProps {
  pressure: ClaimLinkPressure;
  links: readonly StoredClaimLink[];
}

/// The ceiling, made visible before it bites: an always-on meter that turns into
/// a warning as the room runs out, with the two ways to make room.
export function VaultCapacity({ pressure, links }: VaultCapacityProps) {
  const tone = vaultTone(pressure);
  const titleId = useId();
  const [confirming, setConfirming] = useState(false);
  const shared = links.filter((l) => l.copiedAt !== undefined);

  const clearShared = () => {
    forgetClaimLinks(shared.map((l) => l.id));
    setConfirming(false);
  };

  return (
    <section className={cx("surface vault-cap", `vault-cap--${tone}`)} aria-labelledby={titleId}>
      <div className="vault-cap__head">
        {tone === "err" ? <WarnGlyph size={19} className="vault-cap__icon" /> : null}
        <h2 className="vault-cap__t" id={titleId}>
          {capacityHeadline(pressure)}
        </h2>
      </div>
      {/* The figures are in the headline; the bar only draws them. */}
      <VaultMeter pressure={pressure} />
      <p className="vault-cap__body">{capacityBody(pressure)}</p>
      <div className="vault-cap__actions">
        <button
          type="button"
          className="btn btn--cta btn--sm vault-cap__export"
          disabled={pressure.count === 0}
          onClick={exportAllClaimLinks}
        >
          Export all {plural(pressure.count, "link")}
        </button>
        {confirming ? (
          <span className="vault-cap__confirm">
            <button
              type="button"
              className="btn btn--outline btn--outline-err"
              onClick={clearShared}
            >
              Delete {plural(shared.length, "copy", "copies")}
            </button>
            <button type="button" className="btn btn--outline" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="btn btn--outline"
            disabled={shared.length === 0}
            onClick={() => setConfirming(true)}
          >
            Clear the ones you have shared
          </button>
        )}
      </div>
      <p className="vault-cap__note">
        {confirming
          ? `This deletes your copy of the ${plural(shared.length, "link")} you have copied or shared. Anyone holding one can still claim it.`
          : "The export holds every link's spending key. Keep the file somewhere only you can open."}
      </p>
    </section>
  );
}

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

/// Export, with the confirmation toast. Shared by the capacity box and the
/// eviction block so both say the same thing about the file.
export function exportAllClaimLinks(): number {
  const n = downloadClaimLinks();
  toast.success(`Saved ${plural(n, "link")} to a file`, {
    description: "Every link in it is a spending key. Keep it somewhere only you can open.",
  });
  return n;
}
