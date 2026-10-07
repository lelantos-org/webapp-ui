import type { ClipboardEvent, ReactNode } from "react";
import { addressLayout } from "@/shared/lib/address";
import { cx } from "@/shared/lib/cx";
import "./address.css";

export interface AddressBlockProps {
  /// The raw address, already checked to be one.
  value: string;
  className?: string | undefined;
}

/// An address in full, laid out to be checked: the same numbered rows of aligned groups on every
/// screen, with the digits tinted so each group has a shape of its own.
export function AddressBlock({ value, className }: AddressBlockProps) {
  const { prefix, rows } = addressLayout(value);
  // A long address has its prefix above numbered rows; a short one has it at the head of the first.
  const numbered = rows.length > 2;
  return (
    <div
      className={cx("addr-block mono", `addr-block--${numbered ? "numbered" : "plain"}`, className)}
      translate="no"
      onCopy={copyUnbroken}
    >
      {prefix ? <span className="addr-block__prefix">{prefix}</span> : null}
      {rows.map((row, r) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and never reorder.
        <span className="addr-block__row" key={r}>
          {row.map((group, g) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: groups are positional and never reorder.
            <span className="addr-block__grp" key={g}>
              {tinted(group)}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}

/// The group's text with each run of digits wrapped for the tint.
function tinted(group: string): ReactNode[] {
  return group.split(/(\d+)/).map((run, i) =>
    i % 2 === 1 ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: runs are positional and never reorder.
      <span className="addr-block__num" key={i}>
        {run}
      </span>
    ) : (
      run
    ),
  );
}

/// A selection copies as unbroken text: the rows would otherwise put line breaks in the address.
function copyUnbroken(e: ClipboardEvent<HTMLElement>) {
  const text = window.getSelection()?.toString().replace(/\s+/g, "");
  if (!text) return;
  e.clipboardData.setData("text/plain", text);
  e.preventDefault();
}
