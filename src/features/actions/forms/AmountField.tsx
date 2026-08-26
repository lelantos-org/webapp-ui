import type { UseFormRegisterReturn } from "react-hook-form";
import { assetUsd, usePrices } from "@/features/prices";
import { preloadProverWorker } from "@/features/wallet";
import { formatUsd } from "@/shared/lib/format";
import { TextField } from "@/shared/ui/Field";
import {
  type AmountValidation,
  type AssetMeta,
  formatBalance,
  pickAmountError,
} from "./amount-field";
import { joinHint } from "./fee-hint";

export interface AmountFieldProps {
  inputProps: UseFormRegisterReturn;
  selected: AssetMeta | undefined;
  /// What the "max" button writes, in circuit units; the button is withheld
  /// when it is `undefined`.
  ///
  /// Not simply "the balance". For a spend the two coincide, but a deposit is
  /// charged the protocol fee *on top*, so its max is the largest amount whose
  /// `amount + fee` still fits — see `depositMaxAmount`. The balance the user
  /// reads travels separately in `hint`.
  maxAmount: bigint | undefined;
  validation: AmountValidation;
  formError?: string;
  hint?: string;
  /// The typed amount in circuit units, for the USD equivalent appended to the
  /// hint. `undefined` while the input is empty or mid-edit, which shows no
  /// dollar figure rather than a stale one.
  amount?: bigint;
  onSetMax(formatted: string): void;
}

/// Shared amount input used by every action form.
export function AmountField({
  inputProps,
  selected,
  maxAmount,
  validation,
  formError,
  hint,
  amount,
  onSetMax,
}: AmountFieldProps) {
  const prices = usePrices();
  // Absent whenever anything is unknown — no asset, no address, no price, or
  // nothing typed yet. Never `$0.00` standing in for "we could not price this".
  const value =
    selected && amount !== undefined && amount > 0n
      ? assetUsd(amount, selected, prices)
      : undefined;
  const usd = value === undefined ? undefined : `≈ ${formatUsd(value)}`;

  return (
    <TextField
      label="amount"
      placeholder={selected ? `1.0 ${selected.symbol ?? ""}`.trim() : "1.0"}
      inputMode="decimal"
      autoComplete="off"
      // Backstop for the tab-hover warm in `HomeLayout`: keyboard navigation
      // reaches this field without hovering a tab. Idempotent.
      onFocus={() => void preloadProverWorker()}
      error={pickAmountError(formError, validation)}
      hint={joinHint(hint, usd)}
      trailing={
        maxAmount !== undefined && selected ? (
          <button
            type="button"
            className="lnk lnk--inline"
            onClick={() => onSetMax(formatBalance(maxAmount, selected))}
          >
            max
          </button>
        ) : null
      }
      {...inputProps}
    />
  );
}
