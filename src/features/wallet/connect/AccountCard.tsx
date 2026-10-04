import { lazy, Suspense, useState } from "react";
import { copyWithToast } from "@/shared/hooks/use-copy";
import { cx } from "@/shared/lib/cx";
import { CopyGlyph, QrGlyph } from "@/shared/ui/icons/glyphs";
import "./AccountCard.css";

const QR_SIZE = 156;

/// Loaded when first asked for: the encoder is not needed to show the address.
const loadQrCode = () => import("qrcode.react").then((m) => ({ default: m.QRCodeSVG }));
const QrCode = lazy(loadQrCode);

export interface AccountCardProps {
  shielded: string;
}

/// The shielded address at the foot of Home, with copy and QR.
export function AccountCard({ shielded }: AccountCardProps) {
  const [showQr, setShowQr] = useState(false);

  return (
    <section className={cx("acct", showQr && "acct--open")} aria-label="Your shielded address">
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
          onPointerEnter={() => void loadQrCode()}
          onFocus={() => void loadQrCode()}
          onClick={() => setShowQr((v) => !v)}
        >
          <QrGlyph size={17} />
        </button>
      </div>

      {showQr ? (
        <div className="acct__qr">
          {/* The fallback holds the code's box, so the card does not jump when it lands. */}
          <Suspense fallback={<span style={{ width: QR_SIZE, height: QR_SIZE }} />}>
            {/* Literal colours: a scanner needs dark modules on light in any theme. */}
            <QrCode value={shielded} size={QR_SIZE} bgColor="#ffffff" fgColor="#14110E" level="M" />
          </Suspense>
          <p>Scan to send to this shielded address</p>
        </div>
      ) : null}
    </section>
  );
}
