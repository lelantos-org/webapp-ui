import { useId } from "react";
import { Link } from "react-router-dom";
import { cx } from "@/shared/lib/cx";
import { ArrowRightGlyph } from "@/shared/ui/glyphs";
import { useLinkVault } from "../use-link-vault";
import { vaultTone } from "../vault-copy";
import { VaultMeter } from "./VaultCapacity";
import "./vault.css";

/// The vault as one panel under Send by link's share column: how full it is and
/// the way in.
export function VaultSummary() {
  const titleId = useId();
  const { pressure } = useLinkVault();
  const tone = vaultTone(pressure);
  return (
    <section className={cx("vault-sum", `vault-sum--${tone}`)} aria-labelledby={titleId}>
      <div className="vault-sum__hdr">
        <h2 className="vault-sum__t" id={titleId}>
          Links you haven't seen claimed
        </h2>
        <span className="vault-sum__count">
          {pressure.count} of {pressure.capacity} in this browser
        </span>
      </div>
      <VaultMeter pressure={pressure} small />
      <Link to="/links" className="vault-sum__link">
        Copy, export or delete them
        <ArrowRightGlyph size={15} />
      </Link>
    </section>
  );
}
