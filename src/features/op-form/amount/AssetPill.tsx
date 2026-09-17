import { type ButtonHTMLAttributes, type ChangeEvent, forwardRef } from "react";
import type { AssetSelectOption } from "@/features/assets";
import { cx } from "@/shared/lib/cx";
import { ChevronDownGlyph } from "@/shared/ui/icons/glyphs";
import { TokenIcon } from "@/shared/ui/icons/TokenIcon";
import "./tokpill.css";

export interface AssetPillProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  symbol: string | undefined;
  /// Token address, for vendor artwork where the icon registry has it.
  address?: string | undefined;
  /// Drawn open while the picker it controls is showing.
  open?: boolean;
}

/// The asset trigger beside an `AmountHero` figure, opening the caller's own picker.
export const AssetPill = forwardRef<HTMLButtonElement, AssetPillProps>(function AssetPill(
  { symbol, address, open = false, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cx("tokpill", open && "tokpill--open", className)}
      aria-haspopup="listbox"
      aria-expanded={open}
      {...rest}
    >
      {symbol ? <TokenIcon symbol={symbol} address={address} /> : null}
      <span className="tokpill__sym">{symbol ?? "Choose"}</span>
      <ChevronDownGlyph size={15} className="tokpill__chev" />
    </button>
  );
});

export interface AssetSelectPillProps {
  options: readonly AssetSelectOption[];
  value: string;
  onChange(value: string): void;
  /// Accessible name; the pill has no visible label.
  label: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}

/// The `AssetPill` look over a transparent native `<select>`.
export function AssetSelectPill({
  options,
  value,
  onChange,
  label,
  disabled = false,
  invalid = false,
  className,
}: AssetSelectPillProps) {
  const current = options.find((o) => o.value === value);
  return (
    <span
      className={cx(
        "tokpill",
        "tokpill--select",
        disabled && "tokpill--disabled",
        invalid && "tokpill--invalid",
        className,
      )}
    >
      {current ? <TokenIcon symbol={current.symbol} address={current.address} /> : null}
      <span className="tokpill__sym">{current?.symbol ?? "Choose"}</span>
      <ChevronDownGlyph size={15} className="tokpill__chev" />
      <select
        className="tokpill__native"
        aria-label={label}
        aria-invalid={invalid || undefined}
        value={value}
        disabled={disabled}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      >
        {current ? null : <option value={value}>Choose an asset</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}
