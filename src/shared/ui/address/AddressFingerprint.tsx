import { addressFingerprint } from "@/shared/lib/address-fingerprint";
import { cx } from "@/shared/lib/cx";
import "./address.css";

export interface AddressFingerprintProps {
  /// A shielded address, already checked to be one.
  value: string;
  /// Label and pictures on one line with no names, for under a field.
  inline?: boolean;
  className?: string | undefined;
}

/// The fingerprint of a shielded address: sixteen pictures that stand for the whole of it, the
/// same wherever the address is shown, so two people check an address by comparing them.
export function AddressFingerprint({ value, inline = false, className }: AddressFingerprintProps) {
  const marks = addressFingerprint(value);
  return (
    <div className={cx("addr-fp", inline && "addr-fp--inline", className)}>
      <span className="caps">Fingerprint</span>
      <span className="addr-fp__marks">
        {marks.map(({ emoji, name }, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: marks are positional and never reorder.
          <span role="img" aria-label={name} title={name} key={i}>
            {emoji}
          </span>
        ))}
      </span>
      {inline ? null : (
        <span className="addr-fp__names" aria-hidden="true">
          {marks.map(({ name }) => name).join(" · ")}
        </span>
      )}
    </div>
  );
}
