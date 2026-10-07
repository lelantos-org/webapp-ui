import { cx } from "@/shared/lib/cx";
import { AddressBlock } from "./AddressBlock";
import { AddressEnds } from "./AddressEnds";
import { AddressFingerprint } from "./AddressFingerprint";
import "./address.css";

export interface AddressSummaryProps {
  /// A shielded address, already checked to be one.
  value: string;
  className?: string | undefined;
}

/// A shielded address someone else is to check: its ends to recognise it, its fingerprint to
/// check it by, and the whole of it closed until asked for, for a copy that has no fingerprint.
export function AddressSummary({ value, className }: AddressSummaryProps) {
  return (
    <div className={cx("addr-sum", className)}>
      <AddressEnds value={value} />
      <AddressFingerprint value={value} />
      <details className="addr-sum__full">
        <summary>Show the full address</summary>
        <AddressBlock value={value} />
      </details>
    </div>
  );
}
