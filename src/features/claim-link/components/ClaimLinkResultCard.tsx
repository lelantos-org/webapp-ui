// Success state for the generate-link flow.

import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { useRef, useState } from "react";
import { shortAddr } from "@/shared/lib/format";
import { AddressBadge } from "@/shared/ui/AddressBadge";

const MASK_LENGTH = 24;
const COPY_FEEDBACK_MS = 1500;

export interface ClaimLinkResultCardProps {
  url: string;
  txHash: string;
  ephAddress: string;
  amountLabel: string;
  onReset(): void;
}

export function ClaimLinkResultCard({
  url,
  txHash,
  ephAddress,
  amountLabel,
  onReset,
}: ClaimLinkResultCardProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const masked = url.replace(/#.*$/, `#${"•".repeat(MASK_LENGTH)}`);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      setCopied(false);
    }
  }

  function downloadQr() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `claim-link-${amountLabel.replace(/\s+/g, "-") || "qr"}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function shareLink() {
    if (!canShare) return;
    try {
      await navigator.share({ url, title: "claim link", text: `claim ${amountLabel}` });
    } catch {
      // user cancelled — no-op
    }
  }

  return (
    <div className="card claim-result">
      <div className="card__hdr">
        <h3 className="card__t">link ready</h3>
        <span className="claim-amount mono">{amountLabel}</span>
      </div>
      <div className="stack stack--md">
        <div className="claim-url">
          <input
            className="fld__inp mono grow txt-xs"
            readOnly
            value={revealed ? url : masked}
            onFocus={(e) => {
              if (revealed) e.currentTarget.select();
            }}
          />
          <button
            type="button"
            className="btn nowrap"
            onClick={() => setRevealed((v) => !v)}
            aria-pressed={revealed}
          >
            {revealed ? "hide" : "reveal"}
          </button>
        </div>

        <div className="claim-actions">
          <button type="button" className="btn" onClick={copyLink}>
            {copied ? "copied ✓" : "copy link"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={downloadQr}>
            download QR
          </button>
          {canShare ? (
            <button type="button" className="btn btn--ghost" onClick={shareLink}>
              share
            </button>
          ) : null}
        </div>

        <div className="qr-wrap">
          <QRCodeSVG value={url} size={192} bgColor="transparent" fgColor="#00ff9c" level="M" />
          <QRCodeCanvas
            value={url}
            size={512}
            bgColor="#000000"
            fgColor="#00ff9c"
            level="M"
            ref={canvasRef}
            style={{ display: "none" }}
          />
        </div>

        <p className="setup-meta">Bearer link · works once · keep private until delivered.</p>

        <details
          className="setup-advanced"
          open={showAdvanced}
          onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
        >
          <summary>Advanced</summary>
          <div className="setup-meta claim-adv">
            <div>
              tx: <span className="mono">{shortAddr(txHash, 8)}</span>
            </div>
            <div>
              ephemeral: <AddressBadge value={ephAddress} />
            </div>
          </div>
        </details>

        <div className="claim-actions">
          <button type="button" className="btn btn--ghost" onClick={onReset}>
            generate another
          </button>
        </div>
      </div>
    </div>
  );
}
