import { Link } from "react-router-dom";
import { recipientRequestPath } from "@/features/payment-request";
import { useCopy } from "@/shared/hooks/use-copy";
import { AddressBlock } from "@/shared/ui/address/AddressBlock";
import { AddressFingerprint } from "@/shared/ui/address/AddressFingerprint";
import { QrCode } from "@/shared/ui/QrCode";

const QR_SIZE = 208;

export interface ProfileCardProps {
  /// The handle as displayed.
  name: string;
  /// The published address, already checked to be a shielded one.
  address: string;
}

/// A handle's published address: its fingerprint, the address in full, a QR code, and the way to
/// pay it.
export function ProfileCard({ name, address }: ProfileCardProps) {
  const { copy, copied } = useCopy(address);
  return (
    <section className="surface surface--card profile-card" aria-label={`Pay ${name}`}>
      <div className="profile-card__qr">
        <QrCode
          value={address}
          size={QR_SIZE}
          marginSize={2}
          title={`Shielded address of ${name}`}
        />
      </div>
      <div className="profile-card__sec">
        <div className="caps">Shielded address</div>
        <div className="profile-card__addr">
          <AddressFingerprint value={address} />
          <AddressBlock value={address} />
        </div>
        <button type="button" className="btn btn--outline btn--sm" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy address"}
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {copied ? "Address copied" : ""}
        </span>
      </div>
      <Link to={recipientRequestPath(address)} className="btn btn--cta">
        Pay {name}
      </Link>
      <p className="profile-card__note">
        Pay opens Send in your wallet with this address filled in. You choose the asset and the
        amount there, and nothing is sent until you confirm.
      </p>
    </section>
  );
}
