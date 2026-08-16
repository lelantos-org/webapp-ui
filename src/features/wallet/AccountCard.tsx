import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { shortAddr } from "@/shared/lib/format";
import { toast } from "@/shared/lib/toast";

export interface AccountCardProps {
  shielded: string;
  eth?: `0x${string}`;
}

/// Wallet identity card — primary surface on home.
export function AccountCard({ shielded, eth }: AccountCardProps) {
  const [showQr, setShowQr] = useState(false);

  return (
    <div className="acct">
      <div className="acct__main">
        <div className="acct__row">
          <div className="acct__lbl">shielded address</div>
          <div className="acct__actions">
            <button
              type="button"
              className="acct__icon"
              aria-label={showQr ? "hide QR" : "show QR"}
              onClick={() => setShowQr((v) => !v)}
            >
              <QrIcon />
            </button>
            <button
              type="button"
              className="acct__icon"
              aria-label="copy shielded address"
              onClick={() => copy(shielded)}
            >
              <CopyIcon />
            </button>
          </div>
        </div>
        <div className="acct__addr mono accent">{shielded}</div>

        {eth ? (
          <div className="acct__eth">
            <span className="acct__eth-lbl">eth</span>
            <button
              type="button"
              className="acct__eth-val mono"
              onClick={() => copy(eth)}
              title={eth}
            >
              {shortAddr(eth, 8)}
            </button>
          </div>
        ) : null}
      </div>

      {showQr ? (
        <div className="acct__qr">
          <QRCodeSVG value={shielded} size={156} bgColor="#ffffff" fgColor="#1e1b4b" level="M" />
          <p className="muted txt-xs">scan to send to this shielded address</p>
        </div>
      ) : null}
    </div>
  );
}

async function copy(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("address copied");
  } catch {
    toast.error("clipboard unavailable");
  }
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" role="img">
      <title>copy</title>
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5 15V6a2 2 0 0 1 2-2h9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function QrIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" role="img">
      <title>QR code</title>
      <rect x="3" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2" />
      <path
        d="M14 14h3v3h-3zM18 18h3v3h-3zM14 19h2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
      />
    </svg>
  );
}
