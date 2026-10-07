import { addressEnds } from "@/shared/lib/address";
import { cx } from "@/shared/lib/cx";
import "./address.css";

export interface AddressEndsProps {
  value: string;
  className?: string | undefined;
}

/// The two ends of an address on one line: enough to recognise it by, never to check it.
export function AddressEnds({ value, className }: AddressEndsProps) {
  const { prefix, head, tail } = addressEnds(value);
  return (
    <p className={cx("addr-ends mono", className)} title={value} translate="no">
      <span className="addr-ends__prefix">{prefix}</span>
      {head} … {tail}
    </p>
  );
}
