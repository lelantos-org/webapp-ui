import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { copyWithToast } from "@/shared/hooks/use-copy";
import { CopyGlyph, QrGlyph } from "@/shared/ui/icons/glyphs";
import "./AccountCard.css";

export interface AccountCardProps {
  shielded: string;
}

/// The shielded address, at the foot of Home.
///
/// Reference, not a headline: wanted when receiving, and otherwise the least
/// urgent thing on the page. The Ethereum account is in the header, which is
/// where the app says whose session this is.
///
/// Copy, then QR. The address wraps in full on a wide screen, where
/// there is room to read it against what the sender pasted, and ellipsises on a
/// narrow one, where the copy button is how it leaves the page anyway.
export function AccountCard({ shielded }: AccountCardProps) {
  const [showQr, setShowQr] = useState(false);

  return (
    <section className="acct" aria-label="Your shielded address">
      <div className="acct__main">
        <p className="acct__lbl">Your shielded address — safe to share, reveals nothing</p>
        <p className="acct__addr mono" title={shielded}>
          {shielded}
        </p>
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
          onClick={() => setShowQr((v) => !v)}
        >
          <QrGlyph size={17} />
        </button>
      </div>

      {showQr ? (
        <div className="acct__qr">
          {/* Literal colours, not tokens: a scanner needs dark modules on a
              light ground whichever theme the page is in. */}
          <QRCodeSVG value={shielded} size={156} bgColor="#ffffff" fgColor="#14110E" level="M" />
          <p>Scan to send to this shielded address</p>
        </div>
      ) : null}
    </section>
  );
}
