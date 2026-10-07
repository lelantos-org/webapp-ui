import { useState } from "react";
import { Link } from "react-router-dom";
import { copyWithToast } from "@/shared/hooks/use-copy";
import { cx } from "@/shared/lib/cx";
import { CopyGlyph, QrGlyph } from "@/shared/ui/icons/glyphs";
import { preloadQrCode, QrCode } from "@/shared/ui/QrCode";
import "./AccountCard.css";

const QR_SIZE = 156;

export interface AccountCardProps {
  shielded: string;
  /// The handle this account claimed: the name it is shown under, and its profile page.
  handle?: { name: string; to: string } | undefined;
}

/// The shielded address at the foot of Home, with copy and QR, under the account's handle if it
/// has one.
export function AccountCard({ shielded, handle }: AccountCardProps) {
  const [showQr, setShowQr] = useState(false);

  return (
    <section className={cx("acct", showQr && "acct--open")} aria-label="Your shielded address">
      <div className="acct__main">
        {handle ? (
          <p className="acct__handle">
            <Link to={handle.to} className="acct__handle-name">
              {handle.name}
            </Link>{" "}
            <span className="acct__lbl">your public handle</span>
          </p>
        ) : null}
        <p className="acct__lbl">Your shielded address — safe to share, reveals nothing</p>
        <p className="acct__addr mono" title={shielded}>
          {shielded}
        </p>
        <Link to="/request" className="acct__request">
          Request a payment →
        </Link>
      </div>
      <div className="acct__actions">
        <button
          type="button"
          className="icon-btn acct__btn"
          aria-label="Copy shielded address"
          onClick={() => void copyWithToast(shielded, "Address copied")}
        >
          <CopyGlyph size={17} />
        </button>
        <button
          type="button"
          className="icon-btn acct__btn"
          aria-label={showQr ? "Hide QR code" : "Show QR code"}
          aria-expanded={showQr}
          onPointerEnter={() => void preloadQrCode()}
          onFocus={() => void preloadQrCode()}
          onClick={() => setShowQr((v) => !v)}
        >
          <QrGlyph size={17} />
        </button>
      </div>

      {showQr ? (
        <div className="acct__qr">
          <QrCode value={shielded} size={QR_SIZE} />
          <p>Scan to send to this shielded address</p>
        </div>
      ) : null}
    </section>
  );
}
