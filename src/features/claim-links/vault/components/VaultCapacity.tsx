import { useId, useState } from "react";
import { cx } from "@/shared/lib/cx";
import { plural } from "@/shared/lib/format/text";
import { WarnGlyph } from "@/shared/ui/icons/glyphs";
import { capacityBody, capacityHeadline, vaultTone } from "../copy";
import { exportAllClaimLinks } from "../export";
import type { ClaimLinkPressure } from "../policy";
import type { StoredClaimLink } from "../record";
import { forgetClaimLinks } from "../store";
import { VaultMeter } from "./VaultMeter";
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
