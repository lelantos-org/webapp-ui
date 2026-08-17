import type { UseFormRegisterReturn } from "react-hook-form";
import {
  type AmountValidation,
  type AssetMeta,
  formatBalance,
  pickAmountError,
} from "@/features/actions/forms/amount-field";
import { preloadProverWorker } from "@/features/wallet/prover/proverWorker";
import { TextField } from "@/shared/ui/Field";

export interface AmountFieldProps {
  inputProps: UseFormRegisterReturn;
  selected: AssetMeta | undefined;
  balance: bigint | undefined;
  validation: AmountValidation;
  formError?: string;
  hint?: string;
  onSetMax(formatted: string): void;
}

/// Shared amount input used by Transfer / Withdraw / Swap.
export function AmountField({
  inputProps,
  selected,
  balance,
  validation,
  formError,
  hint,
  onSetMax,
}: AmountFieldProps) {
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
      hint={hint}
      trailing={
        balance !== undefined && selected ? (
          <button
            type="button"
            className="lnk lnk--inline"
            onClick={() => onSetMax(formatBalance(balance, selected))}
          >
            max
          </button>
        ) : null
      }
      {...inputProps}
    />
  );
}
