import { LinkActions } from "@/shared/ui/LinkActions";
import { QrCode } from "@/shared/ui/QrCode";

const QR_SIZE = 208;

export interface RequestLinkProps {
  url: string;
  /// "12.5 USDC".
  amountLabel: string;
  chainName: string;
}

/// A payment request as a QR code and a link, with copy and share actions.
export function RequestLink({ url, amountLabel, chainName }: RequestLinkProps) {
  return (
    <section className="reqlink" aria-label="Your payment request">
      <div className="reqlink__qr">
        <QrCode
          value={url}
          size={QR_SIZE}
          marginSize={2}
          title={`Payment request for ${amountLabel}`}
        />
      </div>
      <p className="reqlink__ask">
        Scan or open to pay <strong>{amountLabel}</strong> on {chainName}
      </p>
      <code className="reqlink__url" title={url}>
        {url.replace(/^https?:\/\//, "")}
      </code>
      <LinkActions url={url} share={{ title: "Payment request", text: `Pay ${amountLabel}` }} />
    </section>
  );
}
